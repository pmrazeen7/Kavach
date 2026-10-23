"""Layer 7: calibrated risk score and the action for each finding."""

from __future__ import annotations

from scanner.result import Finding

SECRETY = {"secret", "key_material", "credential_url"}
SOFT_PII = {"email", "phone_in", "phone_intl", "passport_in", "ipv4_private"}

# How much each category contributes to the 0-100 score.
WEIGHT = {"secret": 1.0, "key_material": 1.0, "credential_url": 1.0, "fingerprint": 1.0, "canary": 1.0, "suspicious": 0.8, "financial": 0.9, "pii": 0.7, "business": 0.4}
TYPE_WEIGHT = {"email": 0.3, "phone_in": 0.45, "phone_intl": 0.4, "ipv4_private": 0.3, "passport_in": 0.5, "ifsc": 0.35}


def risk_score(findings: list[Finding]) -> int:
    """Noisy-OR across findings: independent evidence accumulates but never exceeds 100."""
    keep = 1.0
    for f in findings:
        if f.action == "ALLOW":
            continue
        w = TYPE_WEIGHT.get(f.type, WEIGHT.get(f.category, 0.5))
        keep *= 1 - min(0.999, w * f.confidence)
    return int(round(100 * (1 - keep)))


def decide(f: Finding, profile: str, tokenize: bool) -> tuple[str, bool]:
    """Return (action, needs_confirmation) for one finding under a policy profile."""
    rewrite = "TOKENIZE" if tokenize else "REDACT"
    cat = f.category

    if cat in ("fingerprint", "canary"):
        return "BLOCK", False

    if cat in SECRETY:
        if f.confidence >= 0.85:
            return ({"strict": "BLOCK", "balanced": "BLOCK", "relaxed": rewrite}[profile], False)
        return ({"strict": "BLOCK", "balanced": "BLOCK", "relaxed": "WARN"}[profile], f.allowlistable and profile != "relaxed")

    if cat == "suspicious":
        return ({"strict": "BLOCK", "balanced": "BLOCK", "relaxed": "WARN"}[profile], profile != "relaxed")

    if cat == "financial":
        return ({"strict": "BLOCK", "balanced": "BLOCK", "relaxed": "REDACT"}[profile], False)

    if cat == "pii":
        if f.type in SOFT_PII or f.confidence < 0.9:
            return ({"strict": rewrite, "balanced": "WARN", "relaxed": "ALLOW"}[profile], False)
        return ({"strict": "REDACT", "balanced": rewrite, "relaxed": "WARN"}[profile], False)

    if cat == "business":
        return ({"strict": "REDACT", "balanced": "WARN", "relaxed": "ALLOW"}[profile], False)

    return "WARN", False
