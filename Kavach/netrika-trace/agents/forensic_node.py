"""Forensic analysis node for the LangGraph pipeline.

Runs PII detection, NER, semantic scoring, and code/secrets detection.
All imports are lazy and wrapped in try/except for Python 3.14 compatibility.
"""

import concurrent.futures
import json
import logging

logger = logging.getLogger(__name__)

# Lazy-loaded singletons
_presidio = None
_spacy_ner = None
_semantic = None
_code_detector = None
_risk_calculator = None


def _get_presidio():
    global _presidio
    if _presidio is None:
        from pii.presidio_analyzer import PresidioAnalyzerWrapper
        _presidio = PresidioAnalyzerWrapper()
    return _presidio


def _get_spacy():
    global _spacy_ner
    if _spacy_ner is None:
        from pii.spacy_ner import SpacyNERExtractor
        _spacy_ner = SpacyNERExtractor()
    return _spacy_ner


def _get_semantic():
    global _semantic
    if _semantic is None:
        from pii.semantic_scorer import SemanticScorer
        _semantic = SemanticScorer()
    return _semantic


def _get_code_detector():
    global _code_detector
    if _code_detector is None:
        from agents.code_detector import CodeDetector
        _code_detector = CodeDetector()
    return _code_detector


def _get_risk_calculator():
    global _risk_calculator
    if _risk_calculator is None:
        from pii.risk_calculator import RiskCalculator
        _risk_calculator = RiskCalculator()
    return _risk_calculator


def _run_pii_detection(payload_text: str) -> tuple[float, list[dict]]:
    try:
        presidio = _get_presidio()
        pii_score = presidio.compute_pii_score(payload_text)
        pii_summary = presidio.get_entity_summary(payload_text)
        entities = []
        for entity_type, count in pii_summary.items():
            entities.append({
                "type": entity_type, "value": "****",
                "start": 0, "count": count, "source": "PII",
            })
        logger.info(f"[FORENSIC] PII: score={pii_score:.3f}, entities={pii_summary}")
        return pii_score, entities
    except Exception as e:
        logger.error(f"[FORENSIC] PII detection failed: {e}")
        return 0.0, []


def _run_ner_extraction(payload_text: str, max_chars: int) -> tuple[float, list[dict]]:
    try:
        spacy_ner = _get_spacy()
        entity_score = spacy_ner.compute_entity_score(payload_text, max_chars=max_chars)
        ner_summary = spacy_ner.get_entity_summary(payload_text, max_chars=max_chars)
        entities = []
        for entity_label, count in ner_summary.items():
            entities.append({
                "type": entity_label, "value": "****",
                "start": 0, "count": count, "source": "NER",
            })
        logger.info(f"[FORENSIC] NER: score={entity_score:.3f}, entities={ner_summary}")
        return entity_score, entities
    except Exception as e:
        logger.error(f"[FORENSIC] NER failed: {e}")
        return 0.0, []


def _run_code_detection(payload_text: str) -> tuple[bool, bool, list[dict]]:
    try:
        code_detector = _get_code_detector()
        code_result = code_detector.analyze(payload_text)
        entities = []
        for det in code_result.detections:
            entities.append({
                "type": det.get("pattern_name", det.get("type", "CODE")),
                "value": "****",
                "start": det.get("start", 0),
                "count": det.get("count", 1),
                "source": "REGEX",
            })
        logger.info(f"[FORENSIC] Code: detected={code_result.code_detected}, secrets={code_result.secrets_detected}")
        return code_result.code_detected, code_result.secrets_detected, entities
    except Exception as e:
        logger.error(f"[FORENSIC] Code detection failed: {e}")
        return False, False, []


def _run_scanner(payload_text: str, history: list) -> object | None:
    """Layered scanner (bare tokens, decoding, fingerprints...). Fails open only if the engine itself errors."""
    try:
        from scanner import service

        return service.scan_text(payload_text, history=history, deep=False)
    except Exception as e:
        logger.error(f"[FORENSIC] Layered scanner failed: {e}")
        return None


def forensic_node(state: dict) -> dict:
    """Run full forensic analysis on the intercepted payload.

    This node:
    1. Runs Presidio PII detection (with regex fallback)
    2. Runs SpaCy NER extraction (with keyword fallback)
    3. Runs semantic similarity scoring (skipped for extension & fast-scan requests)
    4. Runs code/secrets detection (regex)
    5. Computes weighted risk score
    6. Classifies intent
    """
    payload = state.get("payload", "")
    incident_id = state.get("incident_id", "unknown")
    user_ip = state.get("user_ip", "")

    if not payload:
        logger.warning(f"[FORENSIC] Empty payload for incident {incident_id}")
        return state

    is_fast_path = user_ip == "chat-upload" or user_ip.startswith("extension") or user_ip.startswith("browser-extension")

    logger.info(f"[FORENSIC] Analyzing incident {incident_id} ({len(payload)} chars, fast_path={is_fast_path})")

    # Extension/file uploads: scan full extracted text for PII (PDF uploads can be large)
    presidio_payload = payload[:500000] if is_fast_path else payload
    ner_max_chars = 10000 if is_fast_path else 10000

    # Execute PII, NER, and Code detection in parallel
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        f_pii = executor.submit(_run_pii_detection, presidio_payload)
        f_ner = executor.submit(_run_ner_extraction, payload[:ner_max_chars], ner_max_chars)
        f_code = executor.submit(_run_code_detection, payload)

        pii_score, pii_entities = f_pii.result()
        entity_score, ner_entities = f_ner.result()
        code_detected, secrets_detected, code_entities = f_code.result()

    # Only include PII entities and code detections in the displayed list.
    # NER entities (PERSON, DATE, ORG, LOCATION, GPE, MONEY, PRODUCT, NORP)
    # are collected for audit only — they must NOT appear in the block pop-up.
    # Only these entity types trigger blocking for extension uploads.
    BLOCK_POLICY_TYPES = {
        "AADHAAR", "PAN", "UPI_ID", "IFSC",
        "SENSITIVE_AWS_KEY", "AWS_ACCESS_KEY",
        "SENSITIVE_PRIVATE_KEY", "PRIVATE_KEY",
        "SENSITIVE_DATABASE_CRED", "DATABASE_URL",
        "SENSITIVE_SECRET_KEY", "SECRET_KEY", "GENERIC_API_KEY",
    }

    # Canonical type map: de-duplicate when both presidio and code_detector fire on the same thing
    CANONICAL_TYPE = {
        "AWS_ACCESS_KEY":          "SENSITIVE_AWS_KEY",
        "DATABASE_URL":            "SENSITIVE_DATABASE_CRED",
        "PRIVATE_KEY":             "SENSITIVE_PRIVATE_KEY",
        "JWT_TOKEN":               "SENSITIVE_SECRET_KEY",
        "GITHUB_TOKEN":            "SENSITIVE_SECRET_KEY",
        "SLACK_TOKEN":             "SENSITIVE_SECRET_KEY",
        "BEARER_TOKEN":            "SENSITIVE_SECRET_KEY",
        "GENERIC_API_KEY":         "SENSITIVE_SECRET_KEY",
        "ENV_VARIABLE":            "SENSITIVE_ENV_FILE_CONTENT",
    }

    # Collect candidate entities, then keep only block-policy types
    candidate_entities = list(pii_entities)
    for e in code_entities:
        etype = e.get("type", "").upper()
        canonical = CANONICAL_TYPE.get(etype, etype)
        if canonical in BLOCK_POLICY_TYPES or etype in BLOCK_POLICY_TYPES:
            candidate_entities.append(e)

    seen_types: set[str] = set()
    entities_found: list[dict] = []
    for e in candidate_entities:
        raw_type = e.get("type", "UNKNOWN")
        canonical = CANONICAL_TYPE.get(raw_type, raw_type)
        if canonical not in BLOCK_POLICY_TYPES and raw_type not in BLOCK_POLICY_TYPES:
            continue
        if canonical not in seen_types:
            seen_types.add(canonical)
            merged = dict(e)
            merged["type"] = canonical
            entities_found.append(merged)

    # NER entities stored separately for dashboard audit view only
    audit_ner_entities = ner_entities


    # ── Semantic Similarity Scoring ─────────────────────────────
    semantic_score = 0.0
    intent_label = "AMBIGUOUS"
    if is_fast_path:
        logger.info(f"[FORENSIC] Skipping semantic scorer for fast-path request ({user_ip})")
    else:
        try:
            semantic = _get_semantic()
            semantic_score = semantic.compute_semantic_score(payload)
            intent_label = semantic.classify_intent(payload)
            logger.info(f"[FORENSIC] Semantic: score={semantic_score:.3f}, intent={intent_label}")
        except Exception as e:
            logger.error(f"[FORENSIC] Semantic scoring failed: {e}")

    if code_detected and intent_label == "SAFE":
        intent_label = "IP_LEAK"

    # ── Compute Weighted Risk Score ─────────────────────────────
    risk_score = 50
    try:
        risk_calc = _get_risk_calculator()
        risk_score = risk_calc.calculate(
            pii_score=pii_score,
            entity_score=entity_score,
            semantic_score=semantic_score,
            code_detected=code_detected,
            secrets_detected=secrets_detected,
        )
        logger.info(f"[FORENSIC] Final risk score: {risk_score}")
    except Exception as e:
        logger.error(f"[FORENSIC] Risk calculation failed: {e}")

    # ── Layered scanner: bare tokens, encodings, fingerprints of real secrets ──
    scan = _run_scanner(payload, state.get("scan_history") or [])
    scanner_action = "ALLOW"
    scanner_summary: dict = {}
    if scan is not None:
        from scanner import service

        scanner_action = scan.action
        scanner_summary = service.summarize(scan)
        known = {e.get("type") for e in entities_found}
        for e in service.to_entities(scan):
            if e["type"] not in known:
                entities_found.append(e)
        if any(f.category in ("secret", "key_material", "credential_url", "fingerprint", "canary", "suspicious") and f.action != "ALLOW" for f in scan.findings):
            secrets_detected = True
        risk_score = max(int(risk_score or 0), scan.score)

    # ── Update State ───────────────────────────────────────────────
    state["pii_score"] = pii_score
    state["entity_score"] = entity_score
    state["semantic_score"] = semantic_score
    state["risk_score"] = risk_score
    state["entities_found"] = entities_found           # only blocking entities → shown in pop-up
    state["audit_ner_entities"] = audit_ner_entities   # generic NER → dashboard audit only
    state["intent_label"] = intent_label
    state["code_detected"] = code_detected
    state["secrets_detected"] = secrets_detected
    state["scanner_action"] = scanner_action
    state["scanner_summary"] = scanner_summary

    return state
