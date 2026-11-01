"""Layer 0: make text comparable before any detector sees it.

Everything here is length-tracking: `normalize()` returns the cleaned text AND a
map from each cleaned character back to its index in the original, so findings
can highlight the exact original span.
"""

from __future__ import annotations

import base64
import binascii
import html
import re
import unicodedata
import urllib.parse
from dataclasses import dataclass

ZERO_WIDTH = set(
    "​‌‍‎‏‪‫‬‭‮⁠⁡⁢⁣⁤"
    "⁦⁧⁨⁩﻿­᠎͏"
)

# Cyrillic and Greek letters that render like Latin ones.
_PAIRS = (
    "аa вb сc еe һh іi јj кk мm нh оo рp ѕs тt уy хx ԁd ɡg ӏl ԛq ԝw "
    "АA ВB СC ЕE НH ІI ЈJ КK МM ОO РP ЅS ТT ХX УY ᏚS "
    "αa βb γy εe ηn ιi κk νv οo ρp τt υu χx ωw "
    "ΑA ΒB ΕE ΖZ ΗH ΙI ΚK ΜM ΝN ΟO ΡP ΤT ΥY ΧX"
)
HOMOGLYPHS = {pair[0]: pair[1] for pair in _PAIRS.split()}

LEET = str.maketrans({"4": "a", "3": "e", "1": "i", "0": "o", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i", "|": "l", "8": "b"})

_SPACED = re.compile(r"(?<![^\s])(?:[A-Za-z0-9_\-+/=.] ){7,}[A-Za-z0-9_\-+/=.](?![^\s])")
_DOTTED = re.compile(r"(?<![^\s])(?:[A-Za-z0-9][._·•] ?){7,}[A-Za-z0-9](?![^\s])")


def normalize(text: str) -> tuple[str, list[int]]:
    """NFKC + strip invisibles + fold homoglyphs, preserving an index map."""
    out: list[str] = []
    idx: list[int] = []
    for i, ch in enumerate(text):
        if ch in ZERO_WIDTH:
            continue
        for c in unicodedata.normalize("NFKC", ch):
            if c in ZERO_WIDTH:
                continue
            out.append(HOMOGLYPHS.get(c, c))
            idx.append(i)
    return "".join(out), idx


def _drop(text: str, idx: list[int], drop_positions: set[int]) -> tuple[str, list[int]]:
    if not drop_positions:
        return text, idx
    keep = [i for i in range(len(text)) if i not in drop_positions]
    return "".join(text[i] for i in keep), [idx[i] for i in keep]


def collapse_spaced(text: str, idx: list[int]) -> tuple[str, list[int]]:
    """'s k - 1 2 3 a b c' -> 'sk-123abc' (runs of single characters)."""
    drop: set[int] = set()
    for pattern in (_SPACED, _DOTTED):
        for m in pattern.finditer(text):
            for i in range(m.start(), m.end()):
                if text[i] in " ._·•" and i != m.start() and i != m.end() - 1:
                    drop.add(i)
    return _drop(text, idx, drop)


def fix_line_splits(text: str, idx: list[int]) -> tuple[str, list[int]]:
    """Join an explicit shell-style continuation inside a token: 'sk-abc\\\n123' -> 'sk-abc123'.

    Deliberately narrow: joining arbitrary neighbouring lines would glue a lone
    token to the next word and break boundaries. General wrapped lines are handled
    by `join_wrapped_lines`, which is scanned as a separate view.
    """
    drop: set[int] = set()
    for m in re.finditer(r"(?<=[A-Za-z0-9_\-])\\\r?\n[ \t]*(?=[A-Za-z0-9_\-])", text):
        drop.update(range(m.start(), m.end()))
    return _drop(text, idx, drop)


def join_wrapped_lines(text: str, idx: list[int]) -> tuple[str, list[int]]:
    """A line ending in a long unbroken token followed by a line starting with a token is
    often one secret that wrapped: drop that newline (and any indent) in a second view."""
    drop: set[int] = set()
    for m in re.finditer(r"(\S{16,})[ \t]*\r?\n[ \t]*(?=\S{6,})", text):
        drop.update(range(m.end(1), m.end()))
    return _drop(text, idx, drop)


def clean(text: str) -> tuple[str, list[int]]:
    t, i = normalize(text)
    t, i = collapse_spaced(t, i)
    return t, i


# ── Recursive decoding ────────────────────────────────────────────

@dataclass
class View:
    name: str       # e.g. "base64", "base64>url"
    text: str
    origin: tuple[int, int]  # span in the *root* cleaned text this view was decoded from


_B64 = re.compile(r"[A-Za-z0-9+/_\-]{16,}={0,2}")
_HEX = re.compile(r"\b(?:[0-9a-fA-F]{2}){8,}\b")
_PCT = re.compile(r"(?:%[0-9A-Fa-f]{2}){3,}")
_ENT = re.compile(r"&(?:#\d{2,6}|#x[0-9a-fA-F]{2,6}|[a-zA-Z]{2,8});")
_TOKEN = re.compile(r"[^\s\"'`<>(){}\[\],;]{10,}")

MAX_VIEWS = 40
MAX_VIEW_CHARS = 64_000


def _printable(b: bytes) -> str | None:
    try:
        s = b.decode("utf-8")
    except UnicodeDecodeError:
        return None
    if len(s) < 6:
        return None
    ok = sum(1 for c in s if c.isprintable() or c in "\r\n\t")
    return s if ok / len(s) >= 0.9 else None


def _decode_b64(tok: str) -> str | None:
    t = tok.strip("=")
    if len(t) < 16 or re.fullmatch(r"[A-Za-z]+", t) and len(t) < 24:
        return None
    for alt in (False, True):
        s = t.replace("-", "+").replace("_", "/") if alt else t
        try:
            raw = base64.b64decode(s + "=" * (-len(s) % 4), validate=True)
        except (binascii.Error, ValueError):
            continue
        out = _printable(raw)
        if out:
            return out
    return None


def _decode_hex(tok: str) -> str | None:
    try:
        return _printable(bytes.fromhex(tok))
    except ValueError:
        return None


def _decoders_for(text: str):
    """Yield (name, span_in_text, decoded) for every decodable piece of `text`."""
    for m in _B64.finditer(text):
        d = _decode_b64(m.group())
        if d:
            yield "base64", m.span(), d
    for m in _HEX.finditer(text):
        d = _decode_hex(m.group())
        if d:
            yield "hex", m.span(), d
    if _PCT.search(text):
        yield "url", (0, len(text)), urllib.parse.unquote(text)
    if _ENT.search(text):
        yield "html", (0, len(text)), html.unescape(text)
    for m in _TOKEN.finditer(text):
        tok = m.group()
        if len(tok) >= 12:
            yield "reversed", m.span(), tok[::-1]
    if len(text) <= 4096 and len(text) >= 12:
        yield "reversed", (0, len(text)), text[::-1]


def decode_views(text: str, depth: int = 3) -> list[View]:
    """Depth-limited decoding. Origins always point at the span in the root text."""
    views: list[View] = []
    seen = {text}
    total = 0

    def walk(cur: str, name: str, origin: tuple[int, int] | None, level: int) -> None:
        nonlocal total
        if level >= depth:
            return
        for kind, span, decoded in _decoders_for(cur):
            if decoded in seen or len(views) >= MAX_VIEWS:
                continue
            total += len(decoded)
            if total > MAX_VIEW_CHARS:
                return
            seen.add(decoded)
            root = origin if origin is not None else span
            nm = f"{name}>{kind}" if name else kind
            views.append(View(nm, decoded, root))
            # a reversed view of a reversed view is the original, skip
            if kind != "reversed":
                walk(decoded, nm, root, level + 1)

    walk(text, "", None, 0)
    return views
