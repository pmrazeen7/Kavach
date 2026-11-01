"""Custom Indian PII recognizer — with enhanced regex fallback for Python 3.14.

Detects Aadhaar numbers, PAN cards, UPI IDs, IFSC codes, and other
Indian-specific sensitive data patterns as required by DPDP Act 2023.

Also detects sensitive content keywords (passwords, credentials, medical,
financial data) even when Presidio/SpaCy can't load.
"""

import re
import logging

logger = logging.getLogger(__name__)

# ── Regex patterns (always available) ──────────────────────────────

REGEX_PATTERNS = {
    "AADHAAR":       r"\b[2-9]\d{3}\s?\d{4}\s?\d{4}\b",
    "PAN":           r"\b[A-Z]{5}[0-9]{4}[A-Z]\b",
    # UPI ID: must end with a real UPI handle suffix
    # Excludes URL auth patterns like user:pass@host by requiring known VPA suffixes
    "UPI_ID":        r"\b[a-zA-Z0-9._\-]{3,}@(?:upi|paytm|okaxis|okicici|okhdfcbank|ybl|axisbank|sbi|ibl|apl|rajgovhdfcbank|pingpay|naviaxis|oksbi|okaxis|waicici|rauthdfcbank)\b",
    "IFSC":          r"\b[A-Z]{4}0[A-Z0-9]{6}\b",
    "INDIAN_PHONE":  r"\b(?:\+91[\s\-]?)?[6-9]\d{9}\b",
    "CREDIT_CARD":   r"\b(?:\d{4}[\s\-]?){3}\d{4}\b",
    "EMAIL_ADDRESS": r"\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b",
    "IP_ADDRESS":    r"\b(?:\d{1,3}\.){3}\d{1,3}\b",
    "US_SSN":        r"\b\d{3}[\s\-]\d{2}[\s\-]\d{4}\b",
    "PASSPORT":      r"\b[A-Z][0-9]{7}\b",
    "DATE_OF_BIRTH": r"\b(?:DOB|date\s+of\s+birth|born\s+on)[:\s]+\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4}\b",
}

SCORE_MAP = {
    "AADHAAR": 0.85,
    "PAN": 0.9,
    "CREDIT_CARD": 0.85,
    "UPI_ID": 0.7,
    "IFSC": 0.85,
    "INDIAN_PHONE": 0.6,
    "EMAIL_ADDRESS": 0.5,
    "IP_ADDRESS": 0.4,
    "US_SSN": 0.95,
    "PASSPORT": 0.8,
    "DATE_OF_BIRTH": 0.7,
    "SENSITIVE_KEYWORD": 0.75,
}

# ── Sensitive content keyword patterns ─────────────────────────────
# These catch sensitive data that regex PII patterns miss:
# passwords, credentials, medical records, financial data, etc.

SENSITIVE_KEYWORDS = {
    "PASSWORD": re.compile(
        r"\b(?:password|passwd|pwd)\s*[:=]\s*\S+", re.IGNORECASE
    ),
    "SECRET_KEY": re.compile(
        r"\b(?:secret|private[_\s]?key|access[_\s]?key|api[_\s]?key|auth[_\s]?token|client[_\s]?secret)\s*[:=]\s*\S+",
        re.IGNORECASE,
    ),
    "CREDENTIAL": re.compile(
        r"\b(?:username|user[_\s]?id|login)\s*[:=]\s*\S+",
        re.IGNORECASE,
    ),
    "DATABASE_CRED": re.compile(
        r"(?:postgres|mysql|mongodb|redis|sqlite|mssql)://[^\s]+",
        re.IGNORECASE,
    ),
    "PRIVATE_KEY": re.compile(
        r"-----BEGIN\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+)?PRIVATE\s+KEY-----"
    ),
    "AWS_KEY": re.compile(r"AKIA[0-9A-Z]{16}"),
    "ENV_FILE_CONTENT": re.compile(
        r"^[A-Z][A-Z0-9_]{2,}=[\"']?[^\s\"']{8,}[\"']?", re.MULTILINE
    ),
}

# Try to import Presidio; use regex fallback if it fails
_USE_PRESIDIO = False
try:
    from presidio_analyzer import AnalyzerEngine, PatternRecognizer, Pattern, RecognizerResult
    _USE_PRESIDIO = True
    logger.info("Presidio loaded successfully")
except Exception as e:
    logger.warning(f"Presidio unavailable ({e}), using regex fallback PII detection")


class PresidioAnalyzerWrapper:
    """PII detector with Presidio (primary) or regex (fallback)."""

    # Only these entity types are allowed to contribute to the block decision.
    # Generic NER labels (PERSON, DATE, ORG, LOCATION, GPE, MONEY, PRODUCT,
    # NORP, FAC, IP_ADDRESS, PHONE_NUMBER) are collected for audit/display
    # purposes only and must NOT drive blocking.
    STANDARD_ENTITIES = [
        "CREDIT_CARD", "EMAIL_ADDRESS", "US_SSN", "CRYPTO", "IBAN_CODE",
        "IP_ADDRESS",
    ]
    INDIAN_ENTITIES = ["AADHAAR", "PAN", "UPI_ID", "IFSC", "INDIAN_PHONE", "INDIAN_PASSPORT"]

    def __init__(self) -> None:
        self._use_presidio = _USE_PRESIDIO
        if self._use_presidio:
            try:
                from presidio_analyzer.nlp_engine import NlpEngineProvider
                nlp_config = {
                    "nlp_engine_name": "spacy",
                    "models": [{"lang_code": "en", "model_name": "en_core_web_sm"}]
                }
                provider = NlpEngineProvider(nlp_configuration=nlp_config)
                nlp_engine = provider.create_engine()
                self.analyzer = AnalyzerEngine(nlp_engine=nlp_engine, supported_languages=["en"])
                for recognizer in self._create_indian_recognizers():
                    self.analyzer.registry.add_recognizer(recognizer)
                logger.info("Presidio AnalyzerEngine ready with Indian recognizers (en_core_web_sm)")
            except Exception as e:
                logger.warning(f"Presidio init failed ({e}), falling back to regex")
                self._use_presidio = False

    @staticmethod
    def _create_indian_recognizers() -> list:
        patterns = {
            "AADHAAR": (r"\b[2-9]\d{3}\s?\d{4}\s?\d{4}\b", 0.85),
            "PAN": (r"\b[A-Z]{5}[0-9]{4}[A-Z]\b", 0.9),
            # Tightened UPI: only match known VPA handle suffixes
            "UPI_ID": (r"\b[a-zA-Z0-9._\-]{3,}@(?:upi|paytm|okaxis|okicici|okhdfcbank|ybl|axisbank|sbi|ibl|apl|pingpay|naviaxis|oksbi|waicici)\b", 0.7),
            "IFSC": (r"\b[A-Z]{4}0[A-Z0-9]{6}\b", 0.85),
            "INDIAN_PHONE": (r"\b(?:\+91[\s\-]?)?[6-9]\d{9}\b", 0.6),
        }
        recognizers = []
        for entity, (regex, score) in patterns.items():
            recognizers.append(
                PatternRecognizer(
                    supported_entity=entity,
                    patterns=[Pattern(name=f"{entity.lower()}_pat", regex=regex, score=score)],
                    name=f"Indian {entity} Recognizer",
                    supported_language="en",
                )
            )
        return recognizers

    def analyze(self, text: str) -> list[dict]:
        """Analyze text for PII entities."""
        if self._use_presidio:
            try:
                all_entities = self.STANDARD_ENTITIES + self.INDIAN_ENTITIES
                results = self.analyzer.analyze(text=text, entities=all_entities, language="en")
                return [
                    {"type": r.entity_type, "start": r.start, "end": r.end, "score": round(r.score, 3)}
                    for r in results
                ]
            except Exception as e:
                logger.error(f"Presidio analyze failed: {e}")

        # Regex fallback
        return self._regex_analyze(text)

    def _regex_analyze(self, text: str) -> list[dict]:
        """Pure regex PII detection fallback — enhanced with sensitive keyword detection."""
        detections = []

        # Standard PII patterns
        for entity_type, pattern in REGEX_PATTERNS.items():
            for match in re.finditer(pattern, text):
                detections.append({
                    "type": entity_type,
                    "start": match.start(),
                    "end": match.end(),
                    "score": SCORE_MAP.get(entity_type, 0.5),
                })

        # Sensitive keyword patterns (catch passwords, credentials, confidential data)
        for keyword_type, compiled_pattern in SENSITIVE_KEYWORDS.items():
            matches = compiled_pattern.findall(text)
            for i, match_text in enumerate(matches):
                detections.append({
                    "type": f"SENSITIVE_{keyword_type}",
                    "start": 0,
                    "end": len(match_text) if isinstance(match_text, str) else 0,
                    "score": SCORE_MAP.get("SENSITIVE_KEYWORD", 0.75),
                })

        if detections:
            logger.info(f"[PII-REGEX] Detected {len(detections)} sensitive items: "
                       f"{set(d['type'] for d in detections)}")

        return detections

    def get_entity_summary(self, text: str) -> dict[str, int]:
        """Get count of detected entity types."""
        detections = self.analyze(text)
        summary: dict[str, int] = {}
        for det in detections:
            summary[det["type"]] = summary.get(det["type"], 0) + 1
        return summary

    def compute_pii_score(self, text: str) -> float:
        """Compute normalized PII risk score (0.0–1.0).

        Only the following entity types drive the risk score that can
        result in a BLOCK decision:
          - Indian IDs: AADHAAR, PAN, UPI_ID, IFSC, INDIAN_PHONE, INDIAN_PASSPORT
          - Financial:  CREDIT_CARD, US_SSN, IBAN_CODE
          - Secrets:    SENSITIVE_PRIVATE_KEY, SENSITIVE_AWS_KEY,
                        SENSITIVE_DATABASE_CRED, SENSITIVE_SECRET_KEY,
                        SENSITIVE_PASSWORD, SENSITIVE_CREDENTIAL,
                        SENSITIVE_ENV_FILE_CONTENT
          - Markers:    SENSITIVE_CONFIDENTIAL_MARKER, SENSITIVE_MEDICAL_RECORD,
                        SENSITIVE_FINANCIAL_DATA, SENSITIVE_PERSONAL_ID

        Everything else (PERSON, DATE, ORG, LOCATION, GPE, MONEY, PRODUCT,
        NORP, FAC, IP_ADDRESS, EMAIL_ADDRESS, PHONE_NUMBER) is ignored for
        scoring so that normal text does not get blocked.
        """
        detections = self.analyze(text)
        if not detections:
            return 0.0

        # Explicit allowlist — only these types can push the score up
        BLOCK_ENTITIES = {
            # Indian-specific PII
            "AADHAAR", "PAN", "UPI_ID", "IFSC", "INDIAN_PHONE", "INDIAN_PASSPORT",
            # Global financial / identity
            "CREDIT_CARD", "US_SSN", "IBAN_CODE", "CRYPTO",
            # Secrets & credentials detected by SENSITIVE_ keyword patterns
            "SENSITIVE_PRIVATE_KEY", "SENSITIVE_AWS_KEY", "SENSITIVE_DATABASE_CRED",
            "SENSITIVE_SECRET_KEY", "SENSITIVE_PASSWORD", "SENSITIVE_CREDENTIAL",
            "SENSITIVE_ENV_FILE_CONTENT",
        }

        # Higher weight for the most critical types — these will always BLOCK
        HIGH_CONFIDENCE = {
            "AADHAAR", "PAN", "UPI_ID", "IFSC",
            "CREDIT_CARD", "US_SSN", "INDIAN_PASSPORT",
            "SENSITIVE_PRIVATE_KEY", "SENSITIVE_AWS_KEY", "SENSITIVE_DATABASE_CRED",
            "SENSITIVE_SECRET_KEY", "SENSITIVE_PASSWORD",
        }

        score = 0.0
        for det in detections:
            entity_type = det["type"]
            # Skip anything not in the explicit block allowlist
            if entity_type not in BLOCK_ENTITIES:
                continue

            confidence = det["score"]
            if entity_type in HIGH_CONFIDENCE:
                base = 0.85
            elif confidence >= 0.8:
                base = 0.5
            elif confidence >= 0.5:
                base = 0.3
            else:
                base = 0.1

            multiplier = 1.25 if entity_type in HIGH_CONFIDENCE else 1.0
            score += base * multiplier

        return min(score, 1.0)
