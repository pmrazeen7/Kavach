"""Server wiring: one shared Scanner whose settings and fingerprints live in the
existing policy key/value table. Imported lazily so the engine stays usable (and
testable) without a database."""

from __future__ import annotations

import logging
import threading
from typing import Iterable

from scanner.engine import Scanner
from scanner.redact import apply as apply_redaction
from scanner.result import Finding, ScanResult
from scanner.settings import Store

log = logging.getLogger("scanner")
_lock = threading.Lock()
_scanner: Scanner | None = None

# Entity labels the dashboard and incident table already understand.
_ENTITY_NAME = {
    "suspicious_token": "SUSPICIOUS_TOKEN", "context_secret": "SENSITIVE_SECRET_KEY", "fingerprint": "KNOWN_SECRET", "canary": "CANARY_TOKEN",
    "aadhaar": "AADHAAR", "pan": "PAN", "card": "CREDIT_CARD", "iban": "IBAN", "ssn": "US_SSN", "gstin": "GSTIN", "ifsc": "IFSC",
    "email": "EMAIL_ADDRESS", "phone_in": "PHONE_NUMBER", "phone_intl": "PHONE_NUMBER", "pem_private_key": "SENSITIVE_PRIVATE_KEY",
    "db_url": "SENSITIVE_DATABASE_CRED", "url_creds": "SENSITIVE_DATABASE_CRED", "aws_access_key": "SENSITIVE_AWS_KEY",
}


def _db_get(key: str, default: str = "") -> str:
    from database.crud import get_policy_value

    return get_policy_value(key, default)


def _db_set(key: str, value: str):
    from database.crud import set_policy_value

    return set_policy_value(key, value)


def _on_canary(f: Finding) -> None:
    log.warning("[CANARY] tripwire value seen (fp=%s, source=%s)", f.fp[:8], next((r for r in f.reasons if r.startswith("source:")), "?"))
    try:
        from database.crud import log_action

        log_action("canary_triggered", "scanner", details={"fp": f.fp[:12], "reasons": f.reasons})
    except Exception:  # alerting must not break a scan
        log.debug("canary audit log failed", exc_info=True)


def get_store() -> Store:
    return get_scanner().store


def get_scanner() -> Scanner:
    global _scanner
    with _lock:
        if _scanner is None:
            _scanner = Scanner(Store(_db_get, _db_set), on_canary=_on_canary)
        return _scanner


def refresh() -> None:
    """Re-read settings and fingerprints after an admin change."""
    s = get_scanner().store
    s.settings(refresh=True)
    s.fingerprints(refresh=True)


def scan_text(text: str, history: Iterable[str] = (), policy: str | None = None, confirmed: Iterable[str] = (), deep: bool = True) -> ScanResult:
    return get_scanner().scan(text, history=history, policy=policy, confirmed=confirmed, deep=deep)


def to_entities(result: ScanResult) -> list[dict]:
    """Dashboard-friendly entity list: type counts only, never values."""
    counts: dict[str, int] = {}
    for f in result.findings:
        if f.action == "ALLOW":
            continue
        name = _ENTITY_NAME.get(f.type) or f.type.upper().replace(":", "_")
        counts[name] = counts.get(name, 0) + 1
    return [{"type": k, "value": "****", "count": v, "source": "SCANNER"} for k, v in counts.items()]


def summarize(result: ScanResult) -> dict:
    """Metadata safe to keep in pipeline state and logs: no text, no values, fingerprints truncated."""
    return {
        "action": result.action,
        "score": result.score,
        "policy": result.policy,
        "needs_confirmation": result.needs_confirmation,
        "elapsed_ms": round(result.elapsed_ms, 2),
        "layers": result.layers,
        "findings": [{"type": f.type, "category": f.category, "confidence": round(f.confidence, 2), "action": f.action, "view": f.view, "fp": f.fp[:12]} for f in result.findings],
    }


def sanitize(text: str, result: ScanResult) -> str:
    """Server-side rewrite for REDACT / TOKENIZE actions when a client skipped the UI."""
    flagged = [f for f in result.findings if f.action in ("REDACT", "TOKENIZE")]
    if not flagged:
        return text
    out, _ = apply_redaction(text, flagged, mode="placeholder")
    return out
