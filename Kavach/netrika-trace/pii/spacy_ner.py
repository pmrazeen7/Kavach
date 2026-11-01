"""SpaCy NER wrapper — with keyword fallback for Python 3.14.

Uses SpaCy to extract organizations, persons, locations. If SpaCy
can't load (Python 3.14 Pydantic v1 issue), falls back to keyword
matching for basic entity detection.
"""

import re
import logging

logger = logging.getLogger(__name__)

# Try to import SpaCy
_SPACY_AVAILABLE = False
try:
    import spacy
    _SPACY_AVAILABLE = True
    logger.info("SpaCy loaded successfully")
except Exception as e:
    logger.warning(f"SpaCy unavailable ({e}), using keyword fallback NER")


# Keyword lists for fallback entity detection
ORG_KEYWORDS = [
    r"\b(?:Google|Microsoft|Amazon|Meta|Apple|OpenAI|Anthropic|AWS|Azure|"
    r"Facebook|Twitter|Netflix|Uber|Infosys|TCS|Wipro|Reliance|HDFC|ICICI|"
    r"SBI|RBI|SEBI|UIDAI|Paytm|PhonePe|Razorpay|Flipkart)\b"
]

PERSON_INDICATORS = r"\b(?:Mr|Mrs|Ms|Dr|Prof|Shri|Smt|Kumar|Singh|Sharma|Patel|Gupta|Shah|Jain|Reddy|Rao|Nair|Menon|Das|Dey|Bose|Sen)\b"


class SpacyNERExtractor:
    """NER extractor with SpaCy (primary) or keyword matching (fallback)."""

    def __init__(self, model_name: str | None = None) -> None:
        self.nlp = None
        if _SPACY_AVAILABLE:
            model = model_name or "en_core_web_sm"
            try:
                self.nlp = spacy.load(model)
                logger.info(f"SpaCy model '{model}' loaded")
            except OSError:
                try:
                    self.nlp = spacy.load("en_core_web_sm")
                except OSError:
                    logger.warning("No SpaCy model found, using keyword fallback")

    def extract_entities(self, text: str, max_chars: int = 10000) -> list[dict]:
        """Extract named entities from text."""
        if self.nlp is not None:
            try:
                doc = self.nlp(text[:max_chars])
                entities = []
                relevant = {"ORG", "PERSON", "GPE", "NORP", "FAC", "PRODUCT", "MONEY", "DATE"}
                for ent in doc.ents:
                    if ent.label_ in relevant:
                        redacted = ent.text[0] + "*" * (len(ent.text) - 1) if ent.text else "***"
                        entities.append({
                            "label": ent.label_,
                            "text": redacted,
                            "start": ent.start_char,
                            "end": ent.end_char,
                        })
                return entities
            except Exception as e:
                logger.error(f"SpaCy NER failed: {e}")

        # Keyword fallback
        return self._keyword_extract(text[:max_chars])

    def _keyword_extract(self, text: str) -> list[dict]:
        """Keyword-based entity extraction fallback."""
        entities = []
        for pattern in ORG_KEYWORDS:
            for m in re.finditer(pattern, text, re.IGNORECASE):
                entities.append({
                    "label": "ORG",
                    "text": m.group()[0] + "***",
                    "start": m.start(),
                    "end": m.end(),
                })
        for m in re.finditer(PERSON_INDICATORS, text):
            entities.append({
                "label": "PERSON",
                "text": m.group()[0] + "***",
                "start": m.start(),
                "end": m.end(),
            })
        return entities

    def get_entity_summary(self, text: str, max_chars: int = 10000) -> dict[str, int]:
        entities = self.extract_entities(text, max_chars=max_chars)
        summary: dict[str, int] = {}
        for ent in entities:
            summary[ent["label"]] = summary.get(ent["label"], 0) + 1
        return summary

    def compute_entity_score(self, text: str, max_chars: int = 10000) -> float:
        """Entity score — always returns 0.0.

        Generic NER entities (PERSON, DATE, ORG, LOCATION, GPE, etc.) are
        collected for display/audit purposes only and must NOT contribute to
        the risk score that drives BLOCK decisions.  Only dedicated PII
        detectors (Aadhaar, PAN, UPI, IFSC, secrets) should drive blocking.
        """
        return 0.0
