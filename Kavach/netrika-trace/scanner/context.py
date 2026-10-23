"""Layer 3: context signals.

Context never *requires* a keyword for a secret to be caught (layer 2 handles
bare tokens). It boosts the confidence of a value that is introduced like a
secret: `password = hunter22`, `my key is ...`, `.env` / YAML / JSON /
`export` lines, curl headers, CLI flags, in many languages.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from scanner import statistical as st
from scanner.normalize import LEET

# Multilingual, lower-case. Order does not matter (the regex sorts by length).
KEYWORDS = [
    # English
    "password", "passwd", "passphrase", "passcode", "pwd", "pass", "secret", "token", "api key", "apikey", "api_key", "api-key",
    "access key", "access_key", "secret key", "secret_key", "private key", "private_key", "client secret", "client_secret",
    "credential", "credentials", "auth key", "auth token", "bearer", "otp", "pin", "cvv", "login", "signing key", "salt",
    "my key", "the key", "use this to log in", "log in with", "sign in with", "here is my", "here's my",
    # Hindi (transliterated and Devanagari)
    "kunji", "gupt", "guptshabd", "paasword", "पासवर्ड", "गुप्त", "कुंजी", "पिन", "ओटीपी",
    # Spanish / Portuguese / French / German / Italian
    "contraseña", "contrasena", "clave", "llave", "senha", "chave", "mot de passe", "motdepasse", "clé", "jeton",
    "passwort", "kennwort", "schlüssel", "schluessel", "geheim", "parola", "password segreta", "chiave",
    # Russian / Arabic / Chinese / Japanese / Korean
    "пароль", "ключ", "токен", "كلمة المرور", "كلمة السر", "مفتاح", "密码", "密钥", "令牌", "口令", "パスワード", "トークン", "비밀번호",
]
def _kw_regex() -> re.Pattern[str]:
    """ASCII keywords must stand alone (no `pass` inside `bypass`, no `pin` inside `spin`);
    keywords in other scripts have no word boundaries to check."""
    ordered = sorted(KEYWORDS, key=len, reverse=True)
    ascii_kw = [re.escape(k) for k in ordered if k.isascii()]
    other_kw = [re.escape(k) for k in ordered if not k.isascii()]
    parts = []
    if ascii_kw:
        parts.append(r"(?<![A-Za-z])(?:" + "|".join(ascii_kw) + r")(?![A-Za-z])")
    if other_kw:
        parts.append("(?:" + "|".join(other_kw) + ")")
    return re.compile("|".join(parts), re.IGNORECASE)


_KW = _kw_regex()
_CODEISH = re.compile(r"[()\[\]{}]|::|\|\||&&|^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+$|^\.{1,2}/|^[A-Za-z]:\\")

SECRETISH_NAME = re.compile(
    r"(?:pass(?:word|wd|phrase|code)?|pwd|secret|token|api[_\-]?key|apikey|access[_\-]?key|auth|credential|private[_\-]?key|"
    r"client[_\-]?secret|signing|salt|dsn|otp|pin|cvv|bearer|session|cookie)",
    re.IGNORECASE,
)

_VALUE = r"[\"'`]?([^\s\"'`<>,;]{4,200})"
# keyword followed by an assignment-style connector
_ASSIGN_AFTER_KW = re.compile(r"^[\"'`\]\s]{0,3}(?::=|=>|->|[:=])\s*" + _VALUE)
# keyword followed by a natural-language connector
_SAY_AFTER_KW = re.compile(r"^\s+(?:is|are|was|will be|equals|hai|hain|es|est|ist|è|é|เป็น|是|है)\s*[:=]?\s*" + _VALUE, re.IGNORECASE)
# keyword immediately followed by a token
_BARE_AFTER_KW = re.compile(r"^\s+" + _VALUE)

_ENV_LINE = re.compile(r"^[ \t]*(?:export[ \t]+|set[ \t]+|\$env:)?([A-Za-z_][A-Za-z0-9_.\-]*)[ \t]*=[ \t]*(.+?)[ \t]*$", re.MULTILINE)
_YAML_LINE = re.compile(r"^[ \t]*-?[ \t]*([A-Za-z_][A-Za-z0-9_.\-]*)[ \t]*:[ \t]+(.+?)[ \t]*$", re.MULTILINE)
_JSON_PAIR = re.compile(r"\"([A-Za-z_][A-Za-z0-9_.\-]*)\"[ \t]*:[ \t]*\"([^\"\n]{4,300})\"")
_CLI_FLAG = re.compile(r"(?:^|\s)--?(?:p|pw|pass|password|passwd|token|secret|api-key|apikey|key|auth)(?:=|\s+)([^\s\"']{4,200}|\"[^\"\n]{4,200}\"|'[^'\n]{4,200}')", re.IGNORECASE)
_CURL_USER = re.compile(r"\bcurl\b[^\n]*?\s-u\s+[\"']?[^\s:\"']+:([^\s\"']{3,200})", re.IGNORECASE)
_HEADER = re.compile(r"(?:-H\s+)?[\"']?(?:x-api-key|x-auth-token|x-access-token|api-key|apikey|authorization|proxy-authorization)[\"']?\s*:\s*(?:bearer\s+|token\s+|basic\s+)?([A-Za-z0-9_\-.~+/=]{8,300})", re.IGNORECASE)
_MYSQL_P = re.compile(r"\bmysql[^\n]*\s-p([^\s\"']{3,100})")


@dataclass
class CtxHit:
    start: int
    end: int
    value: str
    kind: str       # assign | say | bare | env | yaml | json | cli | curl | header
    keyword: str
    weight: float


def _strip_quotes(v: str) -> str:
    v = v.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'`":
        v = v[1:-1]
    return v.rstrip(",;")


def find_context_values(text: str) -> list[CtxHit]:
    hits: list[CtxHit] = []
    lowered = text.lower()
    leet = lowered.translate(LEET)  # same length: catches p4ssw0rd, s3cr3t, t0k3n

    seen_kw: set[int] = set()
    for source in (lowered, leet):
        for m in _KW.finditer(source):
            if m.start() in seen_kw:
                continue
            seen_kw.add(m.start())
            tail = text[m.end() : m.end() + 240]
            kw = text[m.start() : m.end()]
            for rx, kind, weight in ((_ASSIGN_AFTER_KW, "assign", 0.35), (_SAY_AFTER_KW, "say", 0.3), (_BARE_AFTER_KW, "bare", 0.12)):
                mm = rx.match(tail)
                if mm:
                    v = mm.group(1)
                    start = m.end() + mm.start(1)
                    hits.append(CtxHit(start, start + len(v), v.rstrip(".,;:!?"), kind, kw.lower(), weight))
                    break

    for rx, kind in ((_ENV_LINE, "env"), (_YAML_LINE, "yaml")):
        for m in rx.finditer(text):
            name, value = m.group(1), _strip_quotes(m.group(2))
            if SECRETISH_NAME.search(name) and 4 <= len(value) <= 300 and not value.startswith(("{", "[", "(")):
                s = m.start(2) + (m.group(2).find(value) if value in m.group(2) else 0)
                hits.append(CtxHit(s, s + len(value), value, kind, name.lower(), 0.4))
    for m in _JSON_PAIR.finditer(text):
        if SECRETISH_NAME.search(m.group(1)):
            hits.append(CtxHit(m.start(2), m.end(2), m.group(2), "json", m.group(1).lower(), 0.4))
    for rx, kind in ((_CLI_FLAG, "cli"), (_CURL_USER, "curl"), (_HEADER, "header"), (_MYSQL_P, "cli")):
        for m in rx.finditer(text):
            v = _strip_quotes(m.group(1))
            s = m.start(1) + (m.group(1).find(v) if v in m.group(1) else 0)
            hits.append(CtxHit(s, s + len(v), v, kind, kind, 0.4))
    return hits


def judge(hit: CtxHit) -> tuple[float, list[str]] | None:
    """Turn a context hit into (confidence, reasons), or None if it is not a credible secret."""
    v = hit.value
    if len(v) < 4 or st.is_placeholder(v) or _CODEISH.search(v):
        return None  # empty, template, or a code expression such as `body.get(` / `os.environ.get`
    p, x = st.probability(v, alone_in_line=False, msg_small=False)
    reasons = [f"ctx:{hit.kind}", f"kw:{hit.keyword.strip()[:24]}"]
    dict_word = x[st.FEATURE_NAMES.index("dict_full")] == 1.0 and v.isalpha()
    if hit.kind == "bare" and (p < 0.35 or dict_word):
        return None
    conf = 1 - (1 - p) * (1 - hit.weight)
    # An identifier or phrase made of dictionary words is code or prose, not a credential... unless it is a
    # word-plus-digits password such as `hunter2xyz` assigned to a label.
    word_like = x[st.FEATURE_NAMES.index("dict_cov")] >= 0.8 and not (any(c.isdigit() for c in v) and len(v) >= 8)
    if hit.kind in ("assign", "env", "yaml", "json", "cli", "curl", "header") and len(v) >= 6 and not dict_word and not word_like:
        conf = max(conf, 0.55)  # an assigned, non-word, non-placeholder value is credible on its own
        reasons.append("assigned-value")
    if p >= 0.5:
        reasons.append("random-looking")
    if x[st.FEATURE_NAMES.index("entropy")] >= 3.2:
        reasons.append("high-entropy")
    if dict_word or word_like:
        conf = min(conf, 0.45)
        reasons.append("looks-like-a-word")
    if conf < 0.5:
        return None
    return min(conf, 0.99), reasons
