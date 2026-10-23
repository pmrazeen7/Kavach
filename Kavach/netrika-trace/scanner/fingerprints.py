"""Layer 4: exact-match fingerprints of YOUR real secrets.

Only keyed hashes are stored (HMAC-SHA256 with a per-installation key); the raw
values are never written anywhere. To find a value inside arbitrary text without
hashing every substring, each secret also contributes a short keyed *anchor*
(a hash of its first 4 characters); only text positions whose 4-gram anchor
matches are checked against the full fingerprints.

Canary values are fake credentials planted as tripwires; any sighting is an
alert, not just a block.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import pathlib
import re
from dataclasses import dataclass, field
from typing import Iterable

KEY_PATH = pathlib.Path(os.getenv("SCANNER_KEY_PATH", "data/scanner/hmac.key"))
ANCHOR_LEN = 4
MIN_SECRET_LEN = 8
SCAN_CAP = 200_000  # characters of text checked per call

_SECRETISH = re.compile(r"(?:pass|pwd|secret|token|key|auth|cred|private|dsn|salt|sign|otp|pin|cvv|url|uri|conn)", re.IGNORECASE)


def _load_key() -> bytes:
    env = os.getenv("SCANNER_HMAC_KEY")
    if env:
        return env.encode()
    try:
        if KEY_PATH.exists():
            return KEY_PATH.read_bytes().strip()
        KEY_PATH.parent.mkdir(parents=True, exist_ok=True)
        key = os.urandom(32).hex().encode()
        KEY_PATH.write_bytes(key)
        try:
            os.chmod(KEY_PATH, 0o600)
        except OSError:
            pass
        return key
    except OSError:
        return b"ephemeral-" + os.urandom(16).hex().encode()  # process-lifetime only


_KEY: bytes | None = None


def key() -> bytes:
    global _KEY
    if _KEY is None:
        _KEY = _load_key()
    return _KEY


def fingerprint(value: str) -> str:
    """Keyed hash of a value (hex, truncated to 128 bits)."""
    return hmac.new(key(), value.encode("utf-8"), hashlib.sha256).hexdigest()[:32]


def anchor(prefix: str) -> str:
    return hashlib.blake2b(prefix.encode("utf-8"), digest_size=6, key=key()[:64]).hexdigest()


@dataclass
class Match:
    start: int
    end: int
    fp: str
    label: str
    canary: bool


@dataclass
class FingerprintStore:
    # {length: {fingerprint: (label, is_canary)}}
    by_len: dict[int, dict[str, tuple[str, bool]]] = field(default_factory=dict)
    anchors: set[str] = field(default_factory=set)

    def __len__(self) -> int:
        return sum(len(v) for v in self.by_len.values())

    def add(self, value: str, label: str, canary: bool = False) -> bool:
        if len(value) < MIN_SECRET_LEN:
            return False
        self.by_len.setdefault(len(value), {})[fingerprint(value)] = (label, canary)
        self.anchors.add(anchor(value[:ANCHOR_LEN]))
        return True

    def find(self, text: str) -> list[Match]:
        if not self.by_len or not text:
            return []
        text = text[:SCAN_CAP]
        out: list[Match] = []
        lengths = sorted(self.by_len)
        for i in range(0, len(text) - MIN_SECRET_LEN + 1):
            if anchor(text[i : i + ANCHOR_LEN]) not in self.anchors:
                continue
            for L in lengths:
                if i + L > len(text):
                    break
                fp = fingerprint(text[i : i + L])
                hit = self.by_len[L].get(fp)
                if hit:
                    out.append(Match(i, i + L, fp, hit[0], hit[1]))
        return out

    # ── persistence (fingerprints only) ──
    def to_json(self) -> str:
        return json.dumps(
            {"v": 1, "items": [[L, fp, label, canary] for L, d in self.by_len.items() for fp, (label, canary) in d.items()], "anchors": sorted(self.anchors)},
            separators=(",", ":"),
        )

    @classmethod
    def from_json(cls, raw: str) -> "FingerprintStore":
        s = cls()
        try:
            d = json.loads(raw)
            for L, fp, label, canary in d.get("items", []):
                s.by_len.setdefault(int(L), {})[fp] = (label, bool(canary))
            s.anchors = set(d.get("anchors", []))
        except (ValueError, TypeError):
            pass
        return s


# ── ingesting your secrets ────────────────────────────────────────

def _walk_json(obj, out: list[tuple[str, str]], path: str = "") -> None:
    if isinstance(obj, dict):
        for k, v in obj.items():
            _walk_json(v, out, f"{path}.{k}" if path else str(k))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            _walk_json(v, out, f"{path}[{i}]")
    elif isinstance(obj, str):
        out.append((path, obj))


def extract_secret_values(path: pathlib.Path) -> list[tuple[str, str]]:
    """(label, value) pairs from a .env-style or JSON file. Values are returned in memory only."""
    text = path.read_text(encoding="utf-8", errors="ignore")
    pairs: list[tuple[str, str]] = []
    if path.suffix.lower() == ".json":
        try:
            _walk_json(json.loads(text), pairs)
        except ValueError:
            return []
    else:
        for line in text.splitlines():
            m = re.match(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(.*?)\s*$", line)
            if m:
                v = m.group(2).strip().strip("\"'")
                pairs.append((m.group(1), v))
    out = []
    for name, v in pairs:
        if len(v) < MIN_SECRET_LEN or v.lower() in ("true", "false", "null", "none") or re.fullmatch(r"\d{1,6}", v):
            continue
        if re.fullmatch(r"https?://[^\s@]*", v) and "@" not in v:
            continue  # a plain URL is not a secret
        if not _SECRETISH.search(name) and len(v) < 16:
            continue  # short non-secret-looking config values
        out.append((f"{path.name}:{name}", v))
    return out


def ingest_files(store: FingerprintStore, paths: Iterable[str]) -> dict:
    added, files, errors = 0, 0, []
    for p in paths:
        path = pathlib.Path(p).expanduser()
        if not path.is_file():
            errors.append(f"{path.name}: not found")
            continue
        files += 1
        try:
            for label, value in extract_secret_values(path):
                added += store.add(value, label)
        except OSError as exc:
            errors.append(f"{path.name}: {exc.strerror or 'unreadable'}")
    return {"files": files, "fingerprints": added, "errors": errors}
