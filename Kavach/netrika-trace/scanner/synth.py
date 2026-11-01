"""Synthetic token generators shared by training and evaluation.

Training and evaluation draw from DIFFERENT word partitions (see `in_train`) and
different seeds, so the eval numbers are not measured on memorised words.
"""

from __future__ import annotations

import base64
import hashlib
import random
import string
import uuid

from scanner.statistical import lexicon

LOWER = string.ascii_lowercase
ALNUM = string.ascii_letters + string.digits
SYMBOLS = "!@#$%^&*-_+=~"


def in_train(word: str) -> bool:
    """Deterministic 75/25 split of dictionary words between training and evaluation."""
    return int(hashlib.sha1(word.encode()).hexdigest()[:4], 16) % 4 != 0


class Words:
    def __init__(self, train: bool) -> None:
        ws = [w for w in lexicon()["words"] if 4 <= len(w) <= 14]
        self.words = [w for w in ws if in_train(w) == train]
        self.short = [w for w in lexicon()["words"] if 3 <= len(w) <= 7 and in_train(w) == train]

    def pick(self, rng: random.Random) -> str:
        return rng.choice(self.words)


# ── Negatives (should NOT be flagged) ─────────────────────────────

def neg_word(rng, W: Words):
    w = W.pick(rng)
    return rng.choice([w, w.capitalize(), w.upper()]), "word"


def neg_identifier(rng, W: Words):
    parts = [rng.choice(W.short) for _ in range(rng.randint(2, 4))]
    style = rng.choice(["camel", "snake", "kebab", "pascal", "upper", "joined"])
    if style == "camel":
        t = parts[0] + "".join(p.capitalize() for p in parts[1:])
    elif style == "pascal":
        t = "".join(p.capitalize() for p in parts)
    elif style == "snake":
        t = "_".join(parts)
    elif style == "kebab":
        t = "-".join(parts)
    elif style == "upper":
        t = "_".join(parts).upper()
    else:
        t = "".join(parts)
    if rng.random() < 0.25:
        t += str(rng.randint(1, 99))
    return t, "identifier"


def neg_uuid(rng, W):
    return str(uuid.UUID(int=rng.getrandbits(128), version=4)), "uuid"


def neg_hash(rng, W):
    n = rng.choice([7, 8, 10, 12, 32, 40, 64])
    return "".join(rng.choice("0123456789abcdef") for _ in range(n)), "hash"


def neg_css(rng, W):
    p = rng.choice(["bg", "text", "border", "px", "py", "mt", "mb", "flex", "grid", "rounded", "shadow", "w", "h"])
    c = rng.choice(["blue", "red", "green", "gray", "indigo", "slate", "center", "lg", "sm", "xl", "full"])
    return f"{p}-{c}-{rng.choice([50, 100, 200, 300, 500, 600, 700, 900])}", "css"


def neg_filename(rng, W):
    ext = rng.choice(["pdf", "docx", "csv", "png", "txt", "json", "yaml", "tsx"])
    sep = rng.choice(["_", "-"])
    return sep.join(rng.choice(W.short) for _ in range(rng.randint(2, 3))) + f".{ext}", "filename"


def neg_version(rng, W):
    return rng.choice([f"v{rng.randint(0,9)}.{rng.randint(0,30)}.{rng.randint(0,99)}", f"{rng.randint(2019,2026)}-{rng.randint(1,12):02d}-{rng.randint(1,28):02d}"]), "version"


def neg_code(rng, W):
    t = rng.choice(["useState", "getElementById", "addEventListener", "console.log", "localStorage", "async_to_sync", "to_dict", "__init__", "requestAnimationFrame"])
    return t, "code"


def neg_ref(rng, W):
    return rng.choice([f"ORD{rng.randint(100000,999999)}", f"INV-{rng.randint(2020,2026)}-{rng.randint(1,9999):04d}", f"TKT{rng.randint(1000,99999)}", f"EMP{rng.randint(100,9999)}"]), "reference"


def neg_regex_class(rng, W):
    parts = rng.choice([["A-Z", "a-z", "0-9"], ["a-z", "0-9"], ["0-9", "A-F"], ["A-Za-z0-9", "_-"], ["0-9", "a-fA-F"]])
    return "".join(parts), "regex-class"


def neg_path(rng, W):
    segs = [rng.choice(W.short) for _ in range(rng.randint(2, 4))]
    return rng.choice(["", "./", "../", "~/"]) + "/".join(segs) + rng.choice(["/", "", ".ts", ".json", ".py"]), "path"


ABBR = "btn msg cfg ctx req resp idx num pdf html src dst impl util params args auth env repo init func cb err tmp val obj arr str buf ptr addr ref doc img pkg lib cmd cli api sdk jwt hmac url uri http tcp dns ssl tls ssh rsa utf ws sql db rpc otp pii dlp llm ocr csv hdr nav".split()
ACRONYMS = ["PBKDF2", "SHA256", "SHA512", "UTF8", "OAuth2", "EC2", "S3", "K8S", "IPv4", "IPv6", "HTTP2", "TLS13", "AES256", "RSA2048", "ES2022", "ISO8601", "RFC2616", "OpenSSL3", "Base64", "Python3", "Win32", "x86_64", "md5sum", "sha1sum"]


def _style(rng, parts):
    style = rng.choice(["camel", "snake", "pascal", "kebab", "upper"])
    if style == "camel":
        return parts[0] + "".join(p.capitalize() for p in parts[1:])
    if style == "pascal":
        return "".join(p.capitalize() for p in parts)
    if style == "snake":
        return "_".join(parts)
    if style == "kebab":
        return "-".join(parts)
    return "_".join(parts).upper()


def neg_abbrev_identifier(rng, W):
    pool = ABBR + W.short
    parts = [rng.choice(ABBR)] + [rng.choice(pool) for _ in range(rng.randint(1, 3))]
    rng.shuffle(parts)
    return _style(rng, parts), "abbrev-identifier"


def neg_acronym(rng, W):
    if rng.random() < 0.5:
        return rng.choice(ACRONYMS), "acronym"
    return "".join(rng.choice(string.ascii_uppercase) for _ in range(rng.randint(2, 5))) + str(rng.randint(1, 9999)), "acronym"


def neg_dotted(rng, W):
    return ".".join(rng.choice(ABBR + W.short) for _ in range(rng.randint(2, 4))), "dotted"


def neg_tailwind2(rng, W):
    return rng.choice(["py-0.5", "px-2.5", "min-h-0", "max-w-screen-xl", "gap-x-2.5", "-mt-1", "w-1/2", "h-[18px]", "md:grid-cols-2", "hover:bg-subtle", "focus-visible:ring-2", "text-[13px]", "rounded-3xl", "min-h-", "max-h-"]) + rng.choice(["", "", " "]), "tailwind"


def neg_markup(rng, W):
    w = rng.choice(W.words)
    return w.capitalize() + rng.choice(["*", "**", ":", "_", "++", "--", "$", "/"]) + rng.choice(["", "", "IP*", "x"]), "markup"


def neg_template(rng, W):
    return rng.choice(["xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx", "XXXX-XXXX-XXXX-XXXX", "yyyy-mm-dd", "hh:mm:ss", "xxx-xx-xxxx", "000-00-0000"]), "template"


def neg_svg(rng, W):
    cmds = "MmLlHhVvCcSsQqTtAa"
    return "".join(rng.choice(cmds) + str(rng.choice([rng.randint(-40, 120), round(rng.uniform(-9, 99), rng.randint(1, 3))])) for _ in range(rng.randint(1, 3))) + rng.choice(["", "z", "Z"]), "svg-path"


def neg_unit(rng, W):
    return str(rng.choice([rng.randint(0, 999), round(rng.uniform(0, 99), 2)])) + rng.choice(["px", "em", "rem", "vh", "dvh", "ms", "%", "deg", "fr"]), "css-unit"


NEGATIVES = [neg_svg, neg_unit, neg_abbrev_identifier, neg_abbrev_identifier, neg_acronym, neg_dotted, neg_dotted, neg_tailwind2, neg_markup, neg_template, neg_regex_class, neg_path, neg_word, neg_word, neg_word, neg_identifier, neg_identifier, neg_uuid, neg_hash, neg_css, neg_filename, neg_version, neg_code, neg_ref]


# ── Positives (random-looking secrets with no label) ──────────────

def pos_lower(rng, W):
    return "".join(rng.choice(LOWER) for _ in range(rng.randint(8, 24))), "rand_lower"


def pos_lower_digits(rng, W):
    return "".join(rng.choice(LOWER + string.digits) for _ in range(rng.randint(8, 28))), "rand_lower_digit"


def pos_base62(rng, W):
    return "".join(rng.choice(ALNUM) for _ in range(rng.randint(12, 64))), "rand_base62"


def pos_b64url(rng, W):
    raw = bytes(rng.getrandbits(8) for _ in range(rng.randint(12, 48)))
    return base64.urlsafe_b64encode(raw).decode().rstrip("="), "rand_b64url"


def pos_b64(rng, W):
    raw = bytes(rng.getrandbits(8) for _ in range(rng.randint(12, 48)))
    return base64.b64encode(raw).decode().rstrip("="), "rand_b64"


def pos_symbols(rng, W):
    n = rng.randint(10, 32)
    return "".join(rng.choice(ALNUM + SYMBOLS) for _ in range(n)), "rand_symbols"


def pos_hex_odd(rng, W):
    n = rng.choice([16, 20, 24, 28, 36, 44, 48])
    return "".join(rng.choice("0123456789abcdef") for _ in range(n)), "rand_hex"


def pos_human_password(rng, W):
    w = rng.choice(W.short)
    leet = str.maketrans({"a": "@", "e": "3", "i": "1", "o": "0", "s": "$"})
    base = rng.choice([w.capitalize(), w.capitalize().translate(leet), w.translate(leet)])
    return base + str(rng.choice([rng.randint(1, 99), rng.randint(1900, 2030), rng.randint(100, 9999)])) + rng.choice(SYMBOLS), "human_password"


POSITIVES = [pos_lower, pos_lower, pos_lower_digits, pos_base62, pos_base62, pos_b64url, pos_b64, pos_symbols, pos_symbols, pos_hex_odd, pos_human_password]


def sample(rng: random.Random, W: Words, positive: bool):
    gen = rng.choice(POSITIVES if positive else NEGATIVES)
    tok, kind = gen(rng, W)
    alone = rng.random() < (0.8 if positive else 0.4)
    small = rng.random() < (0.7 if alone else 0.2)
    return tok, kind, alone, small
