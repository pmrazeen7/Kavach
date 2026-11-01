"""Scanner settings, persisted through the existing policy key/value table.

Everything stored here is metadata: a profile name, salted fingerprints,
patterns and file *paths*. No raw secret is ever persisted.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict
from typing import Callable

from scanner.fingerprints import FingerprintStore

PROFILES = ("strict", "balanced", "relaxed")
KEY_SETTINGS = "scanner.settings"
KEY_FINGERPRINTS = "scanner.fingerprints"


@dataclass
class Settings:
    profile: str = "balanced"
    allowlist: list[str] = field(default_factory=list)          # fingerprints marked safe
    custom_patterns: list[dict] = field(default_factory=list)   # {name, pattern, category, action}
    fingerprint_sources: list[str] = field(default_factory=list)  # file paths to ingest
    internal_hosts: list[str] = field(default_factory=list)
    codenames: list[str] = field(default_factory=list)
    tokenize: bool = True            # prefer reversible placeholders over irreversible masking
    scan_output: bool = True         # scan the model's replies too

    def clean(self) -> "Settings":
        if self.profile not in PROFILES:
            self.profile = "balanced"
        self.allowlist = sorted({a for a in self.allowlist if isinstance(a, str) and len(a) == 32})
        pats = []
        for p in self.custom_patterns[:50]:
            if isinstance(p, dict) and p.get("name") and p.get("pattern"):
                pats.append({
                    "name": str(p["name"])[:60],
                    "pattern": str(p["pattern"])[:300],
                    "category": p.get("category") if p.get("category") in ("secret", "pii", "business", "financial") else "business",
                    "action": p.get("action") if p.get("action") in ("WARN", "REDACT", "TOKENIZE", "BLOCK") else "WARN",
                })
        self.custom_patterns = pats
        self.fingerprint_sources = [str(s)[:400] for s in self.fingerprint_sources[:50]]
        self.internal_hosts = [str(s)[:120].lower() for s in self.internal_hosts[:200]]
        self.codenames = [str(s)[:80] for s in self.codenames[:200]]
        return self


Getter = Callable[[str, str], str]
Setter = Callable[[str, str], object]


class Store:
    """Reads and writes settings + fingerprints through get/set callables (DB-backed in the server)."""

    def __init__(self, get: Getter | None = None, set_: Setter | None = None) -> None:
        self._get, self._set = get, set_
        self._mem: dict[str, str] = {}
        self._settings: Settings | None = None
        self._fps: FingerprintStore | None = None

    def _read(self, key: str) -> str:
        return self._get(key, "") if self._get else self._mem.get(key, "")

    def _write(self, key: str, value: str) -> None:
        if self._set:
            self._set(key, value)
        else:
            self._mem[key] = value

    def settings(self, refresh: bool = False) -> Settings:
        if self._settings is None or refresh:
            raw = self._read(KEY_SETTINGS)
            try:
                self._settings = Settings(**json.loads(raw)).clean() if raw else Settings()
            except (TypeError, ValueError):
                self._settings = Settings()
        return self._settings

    def save_settings(self, s: Settings) -> Settings:
        self._settings = s.clean()
        self._write(KEY_SETTINGS, json.dumps(asdict(self._settings)))
        return self._settings

    def fingerprints(self, refresh: bool = False) -> FingerprintStore:
        if self._fps is None or refresh:
            raw = self._read(KEY_FINGERPRINTS)
            self._fps = FingerprintStore.from_json(raw) if raw else FingerprintStore()
        return self._fps

    def save_fingerprints(self, fps: FingerprintStore) -> None:
        self._fps = fps
        self._write(KEY_FINGERPRINTS, fps.to_json())
