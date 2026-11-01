"""Shared result types. Raw secret values never leave a Finding: only a masked
preview and a salted fingerprint are exposed."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

ACTIONS = ["ALLOW", "WARN", "TOKENIZE", "REDACT", "BLOCK"]
ACTION_RANK = {a: i for i, a in enumerate(ACTIONS)}


def max_action(a: str, b: str) -> str:
    return a if ACTION_RANK[a] >= ACTION_RANK[b] else b


@dataclass
class Finding:
    layer: int
    type: str          # rule id, or "suspicious_token" / "fingerprint" / "canary"
    label: str         # human label
    category: str      # secret | key_material | credential_url | pii | financial | business | suspicious | fingerprint | canary
    start: int         # offsets in the ORIGINAL scanned text
    end: int
    confidence: float
    reasons: list[str] = field(default_factory=list)
    view: str = "plain"        # plain | base64 | hex | url | html | reversed | joined ...
    allowlistable: bool = True
    fp: str = ""               # salted fingerprint of the normalized value (for allowlist / audit)
    masked: str = ""
    action: str = "WARN"
    needs_confirmation: bool = False
    spans_messages: bool = False
    value: str = field(default="", repr=False)  # in-memory only, stripped by to_dict()

    def to_dict(self) -> dict[str, Any]:
        return {
            "layer": self.layer,
            "type": self.type,
            "label": self.label,
            "category": self.category,
            "start": self.start,
            "end": self.end,
            "confidence": round(self.confidence, 3),
            "reasons": self.reasons,
            "view": self.view,
            "allowlistable": self.allowlistable,
            "fp": self.fp,
            "masked": self.masked,
            "action": self.action,
            "needs_confirmation": self.needs_confirmation,
            "spans_messages": self.spans_messages,
        }


@dataclass
class ScanResult:
    findings: list[Finding]
    score: int
    action: str
    policy: str
    needs_confirmation: bool
    elapsed_ms: float
    truncated: bool = False
    layers: dict[str, int] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "findings": [f.to_dict() for f in self.findings],
            "score": self.score,
            "action": self.action,
            "policy": self.policy,
            "needs_confirmation": self.needs_confirmation,
            "elapsed_ms": round(self.elapsed_ms, 2),
            "truncated": self.truncated,
            "layers": self.layers,
            "notes": self.notes,
        }
