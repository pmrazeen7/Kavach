"""Layer 2: a context-free statistical detector for opaque tokens.

It answers one question per token: "does this look like a randomly generated
credential rather than a word, a name, an identifier or a hash?". The features
are deliberately simple, deterministic arithmetic so that the TypeScript engine
(frontend/src/scanner/statistical.ts) reproduces them exactly; a parity test
enforces that.
"""

from __future__ import annotations

import json
import math
import pathlib
import re
from functools import lru_cache

RULES = pathlib.Path(__file__).parent / "rules"

FEATURE_NAMES = [
    "bias_len", "log_len", "entropy", "entropy_norm", "lower", "upper", "digit", "symbol",
    "classes", "transitions", "vowel", "max_cons", "max_vowel", "max_rep",
    "lp_avg", "lp_min", "has_letters", "dict_cov", "dict_full", "benign_shape",
    "alone_in_line", "msg_small", "mixed_alnum", "ends_symbol", "has_special", "special_ratio",
]

VOWELS = set("aeiouy")
SPECIAL = set("!@#$%^&*+=~?")  # password-style symbols; `_ - .` are common in identifiers
_PIECE = re.compile(r"[A-Z]?[a-z]+|[A-Z]+(?![a-z])")

_UUID = re.compile(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
_HEXH = re.compile(r"[0-9a-fA-F]+")
_SEMVER = re.compile(r"v?\d+(?:\.\d+){1,3}(?:[-+][A-Za-z0-9.]+)?")
_DATE = re.compile(r"\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4}")
_HEXCOLOR = re.compile(r"#?[0-9a-fA-F]{6}")
_IPV4 = re.compile(r"\d{1,3}(?:\.\d{1,3}){3}")


@lru_cache(maxsize=1)
def lexicon() -> dict:
    d = json.loads((RULES / "lexicon.json").read_text(encoding="utf-8"))
    d["wordset"] = set(d["words"])
    d["uni_total"] = sum(d["uni"].values())
    return d


@lru_cache(maxsize=1)
def model() -> dict:
    return json.loads((RULES / "model.json").read_text(encoding="utf-8"))


def shannon(t: str) -> float:
    n = len(t)
    counts: dict[str, int] = {}
    for c in t:
        counts[c] = counts.get(c, 0) + 1
    return -sum((v / n) * math.log2(v / n) for v in counts.values())


def pieces(token: str) -> list[str]:
    """Lowercase alphabetic pieces, split on camelCase and non-letters."""
    return [p.lower() for p in _PIECE.findall(token)]


def char_logprob(word: str, lex: dict) -> float:
    """Average per-character log2 probability under an interpolated trigram model."""
    s = "^^" + word + "$"
    uni, bi, tri, total = lex["uni"], lex["bi"], lex["tri"], lex["uni_total"]
    lp = 0.0
    for i in range(2, len(s)):
        c = s[i]
        p1 = (uni.get(c, 0) + 0.5) / (total + 0.5 * 40)
        b = bi.get(s[i - 1], {})
        bt = sum(b.values())
        p2 = (b.get(c, 0) + 0.1) / (bt + 0.1 * 40) if bt else p1
        t = tri.get(s[i - 2 : i], {})
        tt = sum(t.values())
        p3 = (t.get(c, 0) + 0.05) / (tt + 0.05 * 40) if tt else p2
        lp += math.log2(0.6 * p3 + 0.3 * p2 + 0.1 * p1)
    return lp / (len(s) - 2)


def dict_coverage(letters: str, wordset: set[str]) -> float:
    """Fraction of letters covered by greedy longest-match dictionary segmentation (min word len 3)."""
    n = len(letters)
    if n == 0:
        return 0.0
    covered = 0
    i = 0
    while i < n:
        hit = 0
        for j in range(min(n, i + 24), i + 2, -1):
            if letters[i:j] in wordset:
                hit = j - i
                break
        if hit:
            covered += hit
            i += hit
        else:
            i += 1
    return covered / n


_TEMPLATEX = re.compile(r"(?:[xXyYmMdDhHsS0]+[-:/. ]?){2,}")
_SVGPATH = re.compile(r"[MmLlHhVvCcSsQqTtAaZz]?-?\d+(?:\.\d+)?(?:[MmLlHhVvCcSsQqTtAaZz,\-]-?\d+(?:\.\d+)?)+[MmLlHhVvCcSsQqTtAaZz]?")
_CSSUNIT = re.compile(r"-?\d+(?:\.\d+)?(?:px|em|rem|vh|vw|dvh|svh|lvh|vmin|vmax|ch|ex|pt|pc|cm|mm|in|fr|deg|rad|ms|s|%)")
_IDENT = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")
_CHARCLASS = re.compile(r"(?:[A-Za-z0-9]-[A-Za-z0-9])+[_\-]*")
_PATH = re.compile(r"[./~]{0,2}(?:[A-Za-z0-9_.\-]+/)+[A-Za-z0-9_.\-]*")


def _path_like(t: str) -> bool:
    """A file path whose segments are made of ordinary words (data/incidents/, src/pages/Login.tsx)."""
    if not _PATH.fullmatch(t):
        return False
    letters = "".join(c for c in t.lower() if c.isalpha())
    return len(letters) >= 4 and dict_coverage(letters, lexicon()["wordset"]) >= 0.7


def _dotted_ident(t: str) -> bool:
    """An attribute chain such as `aiohttp.WSMsgType.ERROR` or `e.clipboardData`."""
    parts = t.split(".")
    if len(parts) < 2 or not all(_IDENT.fullmatch(p) for p in parts):
        return False
    letters = "".join(c for c in t.lower() if c.isalpha())
    return len(letters) >= 4 and dict_coverage(letters, lexicon()["wordset"]) >= 0.55


def benign_shape(t: str) -> bool:
    if _SVGPATH.fullmatch(t) or _CSSUNIT.fullmatch(t) or _dotted_ident(t):
        return True
    if _CHARCLASS.fullmatch(t) or _TEMPLATEX.fullmatch(t) or _path_like(t):
        return True
    if _UUID.fullmatch(t) or _DATE.fullmatch(t) or _IPV4.fullmatch(t) or _SEMVER.fullmatch(t):
        return True
    if _HEXH.fullmatch(t) and len(t) in (7, 8, 9, 10, 11, 12, 32, 40, 56, 64, 96, 128):
        return True
    return bool(_HEXCOLOR.fullmatch(t))


def features(token: str, alone_in_line: bool = False, msg_small: bool = False) -> list[float]:
    lex = lexicon()
    n = len(token)
    lower = sum(c.islower() for c in token)
    upper = sum(c.isupper() for c in token)
    digit = sum(c.isdigit() for c in token)
    symbol = n - lower - upper - digit
    special = sum(c in SPECIAL for c in token)
    H = shannon(token)
    classes = (lower > 0) + (upper > 0) + (digit > 0) + (symbol > 0)

    def cls(c: str) -> int:
        return 0 if c.islower() else 1 if c.isupper() else 2 if c.isdigit() else 3

    transitions = sum(1 for a, b in zip(token, token[1:]) if cls(a) != cls(b)) / max(1, n - 1)

    letters = "".join(c for c in token.lower() if c.isalpha())
    vow = sum(c in VOWELS for c in letters) / len(letters) if letters else 0.0
    max_cons = max_vow = run = 0
    prev = None
    for c in letters:
        v = c in VOWELS
        run = run + 1 if v == prev else 1
        prev = v
        if v:
            max_vow = max(max_vow, run)
        else:
            max_cons = max(max_cons, run)
    max_rep = 1
    r = 1
    for a, b in zip(token, token[1:]):
        r = r + 1 if a == b else 1
        max_rep = max(max_rep, r)

    ps = [p for p in pieces(token) if len(p) >= 3]
    if ps:
        tot = sum(len(p) for p in ps)
        lp_avg = sum(char_logprob(p, lex) * len(p) for p in ps) / tot
        lp_min = min(char_logprob(p, lex) for p in ps)
    else:
        lp_avg = lp_min = -5.0
    wordset = lex["wordset"]
    dict_cov = sum(dict_coverage(p, wordset) * len(p) for p in ps) / sum(len(p) for p in ps) if ps else 0.0
    all_pieces = pieces(token)
    dict_full = 1.0 if all_pieces and all(p in wordset for p in all_pieces) and len("".join(all_pieces)) >= 0.6 * n else 0.0

    return [
        1.0,
        math.log(n),
        H,
        H / math.log2(n) if n > 1 else 0.0,
        lower / n, upper / n, digit / n, symbol / n,
        float(classes), transitions, vow,
        float(min(max_cons, 12)), float(min(max_vow, 8)), float(min(max_rep, 8)),
        lp_avg, lp_min, 1.0 if letters else 0.0,
        dict_cov, dict_full, 1.0 if benign_shape(token) else 0.0,
        1.0 if alone_in_line else 0.0, 1.0 if msg_small else 0.0,
        1.0 if (letters and digit) else 0.0,
        1.0 if (token and not token[-1].isalnum()) else 0.0,
        1.0 if special else 0.0,
        special / n,
    ]


def probability(token: str, alone_in_line: bool = False, msg_small: bool = False) -> tuple[float, list[float]]:
    m = model()
    x = features(token, alone_in_line, msg_small)
    z = m["w"][0] * 1.0
    for i in range(1, len(x)):
        z += m["w"][i] * (x[i] - m["mean"][i]) / m["std"][i]
    z = max(-30.0, min(30.0, z))
    return 1.0 / (1.0 + math.exp(-z)), x


PLACEHOLDER = re.compile(
    r"^(?:x{4,}|\*{3,}|\.{3,}|\?{3,}|<[^>]+>|\[[^\]]+\]|\{\{.*\}\}|\$\{.*\}|\$[A-Z_]+|%[A-Z_]+%|your[_\-]?.*|my[_\-]?(?:api|secret|token|key|password).*|"
    r"(?:changeme|change_me|example|sample|dummy|test|testing|password|secret|token|placeholder|redacted|none|null|undefined|todo|fixme|abcdef\w*|12345\w*|qwerty\w*)\b.*|"
    r"(?:process\.env|os\.environ|os\.getenv|env\[|getenv\().*)$",
    re.IGNORECASE,
)


_TEMPLATE = re.compile(r"<[^<>\s]{1,40}>|\$\{[^}]*\}|\{\{[^}]*\}\}|\[[A-Z_ ]{3,30}\]")
_SCHEME = re.compile(r"^(?:bearer|basic|token)\s+", re.IGNORECASE)


def is_placeholder(value: str) -> bool:
    """Template variables, obvious dummy values and masked values are not secrets."""
    v = _SCHEME.sub("", value.strip())
    return bool(PLACEHOLDER.match(v)) or bool(_TEMPLATE.search(v)) or len(set(v)) <= 2


TOKEN_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9_\-+/=.!@#$%^&*~]{4,}")


def candidate_tokens(text: str):
    """Yield (token, start, end) for candidate opaque tokens in `text`."""
    for m in TOKEN_RE.finditer(text):
        tok = m.group().rstrip(".,;:!?*_+-$")
        nxt = text[m.start() + len(m.group()) : m.start() + len(m.group()) + 1]
        if tok.endswith("=") and nxt in ("\"", "'", "{", "<", "(", "["):
            tok = tok.rstrip("=")  # `className=` is an attribute name, not a base64 pad
        if len(tok) < 6 or len(tok) > 256 or not any(c.isalpha() for c in tok):
            continue  # numbers (120_000, 3.14, 4-5-6) are not credentials
        # URLs, paths and emails are owned by other layers.
        if "://" in text[max(0, m.start() - 8) : m.start() + 3] or (tok.count("/") >= 2 and "." in tok):
            continue
        yield tok, m.start(), m.start() + len(tok)
