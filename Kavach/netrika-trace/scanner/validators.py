"""Checksum and shape validators that turn a regex hit into a real finding."""

from __future__ import annotations

import base64
import json
import re

_VERHOEFF_D = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]
_VERHOEFF_P = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]


def _digits(s: str) -> str:
    return re.sub(r"\D", "", s)


def verhoeff(s: str) -> bool:
    d = _digits(s)
    if len(d) != 12 or d[0] in "01":
        return False
    c = 0
    for i, ch in enumerate(reversed(d)):
        c = _VERHOEFF_D[c][_VERHOEFF_P[i % 8][int(ch)]]
    return c == 0


def luhn(s: str) -> bool:
    d = _digits(s)
    if not 13 <= len(d) <= 19 or len(set(d)) == 1:
        return False
    total = 0
    for i, ch in enumerate(reversed(d)):
        n = int(ch)
        if i % 2:
            n *= 2
            if n > 9:
                n -= 9
        total += n
    return total % 10 == 0


def iban(s: str) -> bool:
    c = re.sub(r"\s", "", s).upper()
    if not 15 <= len(c) <= 34 or not re.fullmatch(r"[A-Z]{2}\d{2}[A-Z0-9]+", c):
        return False
    r = c[4:] + c[:4]
    n = "".join(str(int(ch, 36)) for ch in r)
    return int(n) % 97 == 1


PAN_TYPES = set("PCHABGJLFT")


def pan(s: str) -> bool:
    return bool(re.fullmatch(r"[A-Z]{5}\d{4}[A-Z]", s)) and s[3] in PAN_TYPES


def ifsc(s: str) -> bool:
    return bool(re.fullmatch(r"[A-Z]{4}0[A-Z0-9]{6}", s))


_GST_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def gstin(s: str) -> bool:
    if not re.fullmatch(r"\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]", s):
        return False
    state = int(s[:2])
    if not 1 <= state <= 99:
        return False
    total = 0
    for i, ch in enumerate(s[:14]):
        v = _GST_CHARS.index(ch) * (1 if i % 2 == 0 else 2)
        total += v // 36 + v % 36
    return _GST_CHARS[(36 - total % 36) % 36] == s[14]


def ssn(s: str) -> bool:
    m = re.fullmatch(r"(\d{3})-(\d{2})-(\d{4})", s)
    if not m:
        return False
    area, group, serial = m.groups()
    return area not in ("000", "666") and not area.startswith("9") and group != "00" and serial != "0000"


def passport_in(s: str) -> bool:
    return bool(re.fullmatch(r"[A-PR-WY][1-9]\d{6}", s))


def ipv4(s: str) -> bool:
    parts = s.split(".")
    return len(parts) == 4 and all(p.isdigit() and 0 <= int(p) <= 255 for p in parts)


def _b64url(seg: str) -> bytes:
    return base64.urlsafe_b64decode(seg + "=" * (-len(seg) % 4))


def jwt(s: str) -> bool:
    """Structure check: header and payload must decode to JSON objects."""
    parts = s.split(".")
    if len(parts) != 3:
        return False
    try:
        header = json.loads(_b64url(parts[0]))
        payload = json.loads(_b64url(parts[1]))
    except Exception:
        return False
    return isinstance(header, dict) and isinstance(payload, dict) and ("alg" in header or "typ" in header)


VALIDATORS = {
    "verhoeff": verhoeff,
    "luhn": luhn,
    "iban": iban,
    "pan": pan,
    "ifsc": ifsc,
    "gstin": gstin,
    "ssn": ssn,
    "passport_in": passport_in,
    "ipv4": ipv4,
    "jwt": jwt,
}


def validate(name: str | None, value: str) -> bool:
    if not name:
        return True
    return VALIDATORS[name](value)
