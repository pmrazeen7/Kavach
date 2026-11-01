"""Masking and placeholders for findings."""

from __future__ import annotations

from scanner.result import Finding


def mask_preview(value: str, category: str) -> str:
    """Short, non-reversible preview shown in the UI and audit trail."""
    n = len(value)
    if n <= 4:
        return "•" * n
    if category in ("financial", "pii") and n >= 8:
        return "•" * (n - 4) + value[-4:]
    if n >= 12:
        return value[:2] + "•" * min(n - 4, 12) + value[-2:]
    return value[:1] + "•" * (n - 1)


def placeholder(finding: Finding, n: int) -> str:
    t = {"secret": "SECRET", "key_material": "KEY", "credential_url": "CREDENTIAL", "pii": "PII", "financial": "FINANCIAL", "business": "INTERNAL", "suspicious": "SECRET", "fingerprint": "SECRET", "canary": "SECRET"}.get(finding.category, "SECRET")
    return f"[{t}_{n}]"


def apply(text: str, findings: list[Finding], mode: str = "mask") -> tuple[str, dict[str, str]]:
    """Return (rewritten text, {placeholder: fingerprint}). `mode` is 'mask' or 'placeholder'.

    The mapping holds fingerprints, never raw values: restoring placeholders in a
    model reply is done by the client, which still has the originals in memory.
    """
    out: list[str] = []
    mapping: dict[str, str] = {}
    pos = 0
    counters: dict[str, int] = {}
    for i, f in enumerate(sorted((f for f in findings if f.action != "ALLOW"), key=lambda f: f.start)):
        if f.start < pos:
            continue
        out.append(text[pos : f.start])
        if mode == "placeholder":
            ph = placeholder(f, len(counters) + 1)
            counters[ph] = 1
            mapping[ph] = f.fp
            out.append(ph)
        else:
            out.append("█" * max(4, min(f.end - f.start, 16)))
        pos = f.end
    out.append(text[pos:])
    return "".join(out), mapping
