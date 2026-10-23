"""The layered scanner. Pure local computation; no network, no raw-text logging."""

from __future__ import annotations

import json
import logging
import pathlib
import re
import time
from functools import lru_cache
from typing import Iterable

from scanner import context as ctx
from scanner import statistical as st
from scanner import validators
from scanner.decision import decide, risk_score
from scanner.fingerprints import FingerprintStore, fingerprint
from scanner.normalize import clean, decode_views, fix_line_splits, join_wrapped_lines
from scanner.redact import mask_preview
from scanner.result import ACTION_RANK, Finding, ScanResult, max_action
from scanner.settings import Settings, Store

log = logging.getLogger("scanner")

RULES_PATH = pathlib.Path(__file__).parent / "rules" / "formats.json"
MAX_CHARS = 1_000_000
HISTORY_TURNS = 6
LAYER_NAMES = {0: "normalize", 1: "formats", 2: "statistical", 3: "context", 4: "fingerprint", 5: "pii-business"}


@lru_cache(maxsize=1)
def format_rules() -> list[dict]:
    rules = json.loads(RULES_PATH.read_text(encoding="utf-8"))["rules"]
    for r in rules:
        r["_rx"] = re.compile(r["pattern"], re.IGNORECASE if "i" in r["flags"] else 0)
    return rules


def _entropy_ok(value: str, minimum: float | None) -> bool:
    return minimum is None or st.shannon(value) >= minimum


class Scanner:
    def __init__(self, store: Store | None = None, on_canary=None) -> None:
        self.store = store or Store()
        self.on_canary = on_canary

    # ── public API ────────────────────────────────────────────────
    def scan(
        self,
        text: str,
        history: Iterable[str] = (),
        policy: str | None = None,
        confirmed: Iterable[str] = (),
        deep: bool = False,
    ) -> ScanResult:
        t0 = time.perf_counter()
        settings = self.store.settings()
        profile = policy if policy in ("strict", "balanced", "relaxed") else settings.profile
        truncated = len(text) > MAX_CHARS
        text = text[:MAX_CHARS]
        hist = [h[:20_000] for h in list(history)[-HISTORY_TURNS:] if isinstance(h, str)]

        findings = self._scan_text(text, settings, deep)
        notes: list[str] = []

        # Multi-turn: a secret split across messages is caught by scanning the joined fragments
        # and the whole transcript, then keeping what touches the newest message.
        if hist:
            findings += self._scan_across_turns(hist, text, settings, deep)

        findings = self._merge(findings)
        self._decide(findings, profile, settings, set(confirmed))
        findings.sort(key=lambda f: (f.start, -f.confidence))
        action = "ALLOW"
        for f in findings:
            action = max_action(action, f.action)
        layers: dict[str, int] = {}
        for f in findings:
            layers[LAYER_NAMES.get(f.layer, str(f.layer))] = layers.get(LAYER_NAMES.get(f.layer, str(f.layer)), 0) + 1
        for f in findings:
            if f.category == "canary" and self.on_canary:
                try:
                    self.on_canary(f)
                except Exception:  # an alert hook must never break scanning
                    log.exception("canary hook failed")
        return ScanResult(
            findings=findings,
            score=risk_score(findings),
            action=action,
            policy=profile,
            needs_confirmation=any(f.needs_confirmation and f.action == "BLOCK" for f in findings),
            elapsed_ms=(time.perf_counter() - t0) * 1000,
            truncated=truncated,
            layers=layers,
            notes=notes,
        )

    # ── per-text scanning ─────────────────────────────────────────
    def _scan_text(self, text: str, settings: Settings, deep: bool, offset_base: int = 0) -> list[Finding]:
        if not text.strip():
            return []
        ntext, idx = clean(text)
        ntext, idx = fix_line_splits(ntext, idx)
        out: list[Finding] = []
        fps = self.store.fingerprints()

        def orig(a: int, b: int) -> tuple[int, int]:
            a = max(0, min(a, len(idx) - 1))
            b = max(a + 1, min(b, len(idx)))
            return idx[a], idx[b - 1] + 1

        # plain view
        out += self._layers_for_view(ntext, "plain", None, orig, settings, fps, deep)
        # the same text with wrapped lines re-joined (a secret broken across lines)
        jtext, jidx = join_wrapped_lines(ntext, list(idx))
        if jtext != ntext:
            def orig_j(a: int, b: int) -> tuple[int, int]:
                a = max(0, min(a, len(jidx) - 1))
                b = max(a + 1, min(b, len(jidx)))
                return jidx[a], jidx[b - 1] + 1

            out += self._layers_for_view(jtext, "joined-lines", None, orig_j, settings, fps, False)
        # decoded views
        for v in decode_views(ntext):
            out += self._layers_for_view(v.text, v.name, v.origin, orig, settings, fps, False)
        # fingerprints also look through whitespace (split secrets)
        if fps and len(ntext) <= 20_000:
            squeezed = [(i, c) for i, c in enumerate(ntext) if not c.isspace()]
            sq_text = "".join(c for _, c in squeezed)
            for m in fps.find(sq_text):
                a, b = squeezed[m.start][0], squeezed[m.end - 1][0] + 1
                s, e = orig(a, b)
                out.append(self._fp_finding(m, s, e, "joined"))
        return out

    def _fp_finding(self, m, s: int, e: int, view: str) -> Finding:
        canary = m.canary
        return Finding(
            layer=4, type="canary" if canary else "fingerprint", label="Canary token seen" if canary else "Known secret from your environment",
            category="canary" if canary else "fingerprint", start=s, end=e, confidence=1.0,
            reasons=["exact-fingerprint-match", f"source:{m.label}"], view=view, allowlistable=False, fp=m.fp, masked="••••••••",
        )

    def _layers_for_view(self, vtext: str, view: str, origin, orig, settings: Settings, fps: FingerprintStore, deep: bool) -> list[Finding]:
        def span(a: int, b: int) -> tuple[int, int]:
            return orig(*origin) if origin is not None else orig(a, b)

        out: list[Finding] = []
        covered: list[tuple[int, int]] = []

        # Layer 1: known formats + validators
        for r in format_rules():
            for m in r["_rx"].finditer(vtext):
                g = r["group"]
                value = m.group(g) if g else m.group(0)
                if not value or not validators.validate(r.get("validator"), value) or not _entropy_ok(value, r.get("min_ent")):
                    continue
                if st.is_placeholder(value) and r["cat"] == "secret":
                    continue
                a, b = (m.start(g), m.end(g)) if g else (m.start(), m.end())
                s, e = span(a, b)
                reasons = ["known-format"] + (["checksum-valid"] if r.get("validator") else [])
                out.append(Finding(layer=1, type=r["id"], label=r["name"], category=r["cat"], start=s, end=e, confidence=r["conf"], reasons=reasons,
                                   view=view, allowlistable=bool(r.get("allow")), fp=fingerprint(value.lower() if r["cat"] in ("pii", "financial") else value),
                                   masked=mask_preview(value, r["cat"]), value=value))
                covered.append((a, b))

        # Layer 3: context
        for h in ctx.find_context_values(vtext):
            j = ctx.judge(h)
            if not j:
                continue
            conf, reasons = j
            s, e = span(h.start, h.end)
            out.append(Finding(layer=3, type="context_secret", label="Secret introduced by context", category="secret", start=s, end=e, confidence=conf,
                               reasons=reasons, view=view, allowlistable=conf < 0.85, fp=fingerprint(h.value), masked=mask_preview(h.value, "secret"), value=h.value))
            covered.append((h.start, h.end))

        # Layer 2: bare opaque tokens, context-free
        stripped_lines = {m.group(1) for m in re.finditer(r"^[ \t]*[\"'`(]?([^\s\"'`()]{6,256})[\"'`),.;]?[ \t]*$", vtext, re.MULTILINE)}
        n_tokens = len(vtext.split())
        small = n_tokens <= 3
        for tok, a, b in (st.candidate_tokens(vtext) if "reversed" not in view else ()):  # reversed prose always looks random
            if tok.isdigit() or st.is_placeholder(tok) or any(a < cb and b > ca for ca, cb in covered):
                continue
            alone = tok in stripped_lines
            p, x = st.probability(tok, alone, small)
            if p < 0.5:
                continue
            s, e = span(a, b)
            reasons = ["no-keyword-needed", "random-looking"] + (["alone-in-message"] if alone else [])
            if x[st.FEATURE_NAMES.index("lp_avg")] < -3.2:
                reasons.append("implausible-as-a-word")
            if x[st.FEATURE_NAMES.index("entropy")] >= 3.3:
                reasons.append("high-entropy")
            out.append(Finding(layer=2, type="suspicious_token", label="Suspicious random token", category="suspicious", start=s, end=e, confidence=min(0.97, p),
                               reasons=reasons, view=view, allowlistable=True, fp=fingerprint(tok), masked=mask_preview(tok, "suspicious"), value=tok))

        # Layer 4: fingerprints of your real secrets
        for m in fps.find(vtext):
            s, e = span(m.start, m.end)
            out.append(self._fp_finding(m, s, e, view))

        # Layer 5: configured business patterns (+ optional deep NLP)
        out += self._business(vtext, view, span, settings)
        if deep and view == "plain":
            out += self._deep(vtext, span)
        return out

    # ── Layer 5 ───────────────────────────────────────────────────
    def _business(self, vtext: str, view: str, span, settings: Settings) -> list[Finding]:
        out: list[Finding] = []
        low = vtext.lower()
        for host in settings.internal_hosts:
            for m in re.finditer(re.escape(host), low):
                s, e = span(m.start(), m.end())
                out.append(Finding(layer=5, type="internal_host", label="Internal hostname", category="business", start=s, end=e, confidence=0.9, reasons=["configured-internal-host"], view=view,
                                   fp=fingerprint(host), masked=mask_preview(host, "business")))
        for name in settings.codenames:
            for m in re.finditer(r"\b" + re.escape(name.lower()) + r"\b", low):
                s, e = span(m.start(), m.end())
                out.append(Finding(layer=5, type="codename", label="Project codename", category="business", start=s, end=e, confidence=0.9, reasons=["configured-codename"], view=view,
                                   fp=fingerprint(name.lower()), masked=mask_preview(name, "business")))
        for p in settings.custom_patterns:
            try:
                rx = re.compile(p["pattern"])
            except re.error:
                continue
            for m in rx.finditer(vtext):
                if not m.group():
                    continue
                s, e = span(m.start(), m.end())
                f = Finding(layer=5, type=f"custom:{p['name']}", label=p["name"], category=p["category"], start=s, end=e, confidence=0.9, reasons=["custom-pattern"], view=view,
                            fp=fingerprint(m.group()), masked=mask_preview(m.group(), p["category"]))
                f.forced_action = p["action"]  # type: ignore[attr-defined]
                out.append(f)
        return out

    def _deep(self, vtext: str, span) -> list[Finding]:
        """Presidio (names, locations, medical) and source-code classification. Server only, lazy."""
        out: list[Finding] = []
        try:
            from pii.presidio_analyzer import PresidioAnalyzerWrapper

            wrapper = _lazy("presidio", PresidioAnalyzerWrapper)
            for d in wrapper.analyze(vtext[:20_000]):
                if d["type"] in ("PERSON", "LOCATION", "NRP", "MEDICAL_LICENSE", "IP_ADDRESS", "US_DRIVER_LICENSE", "US_BANK_NUMBER", "UK_NHS", "CRYPTO") and d["score"] >= 0.6:
                    s, e = span(d["start"], d["end"])
                    cat = "pii"
                    out.append(Finding(layer=5, type=f"presidio:{d['type'].lower()}", label=d["type"].replace("_", " ").title(), category=cat, start=s, end=e,
                                       confidence=min(0.85, d["score"]), reasons=["nlp-entity"], view="plain", fp=fingerprint(vtext[d["start"]:d["end"]].lower()),
                                       masked=mask_preview(vtext[d["start"]:d["end"]], cat)))
        except Exception as exc:  # optional dependency, never fatal
            log.debug("deep PII unavailable: %s", exc)
        try:
            from agents.code_detector import CodeDetector

            res = _lazy("code", CodeDetector).analyze(vtext[:50_000])
            if res.code_detected:
                out.append(Finding(layer=5, type="source_code", label="Source code", category="business", start=0, end=min(len(vtext), 1), confidence=0.8,
                                   reasons=["code-structure"], view="plain", allowlistable=True, fp=fingerprint("source_code"), masked="</>"))
        except Exception as exc:
            log.debug("code detector unavailable: %s", exc)
        return out

    # ── conversations ─────────────────────────────────────────────
    def _scan_across_turns(self, hist: list[str], text: str, settings: Settings, deep: bool) -> list[Finding]:
        out: list[Finding] = []
        newest_start = None
        # (a) whole transcript
        transcript = "\n".join(hist + [text])
        newest_start = len(transcript) - len(text)
        for f in self._scan_text(transcript, settings, False):
            if f.end > newest_start:
                f.start = max(0, f.start - newest_start)
                f.end = max(f.start + 1, min(f.end - newest_start, len(text)))
                f.spans_messages = True
                f.reasons.append("spans-messages")
                out.append(f)
        # (b) consecutive single-token fragments, e.g. "sk-ant-" then "api03-..." then "...XYZ"
        frags = []
        for m in hist + [text]:
            s = m.strip()
            frags.append(s if re.fullmatch(r"\S{3,128}", s) else None)
        run: list[str] = []
        for fr in reversed(frags):
            if fr is None:
                break
            run.append(fr)
        if len(run) >= 2 and frags[-1] is not None:
            joined = "".join(reversed(run))
            for f in self._scan_text(joined, settings, False):
                f.start, f.end = 0, max(1, len(text))
                f.spans_messages = True
                f.view = "joined"
                f.reasons.append("split-across-messages")
                out.append(f)
        return out

    # ── merge + decide ────────────────────────────────────────────
    @staticmethod
    def _merge(findings: list[Finding]) -> list[Finding]:
        """Collapse overlapping findings, keeping the strongest and the union of reasons."""
        prio = {"canary": 6, "fingerprint": 5, "key_material": 4, "credential_url": 4, "secret": 3, "financial": 3, "pii": 2, "business": 2, "suspicious": 1}
        findings = sorted(findings, key=lambda f: (-prio.get(f.category, 0), -f.confidence, f.start))
        kept: list[Finding] = []
        for f in findings:
            clash = next((k for k in kept if f.start < k.end and f.end > k.start), None)
            if clash is not None:
                for r in f.reasons:
                    if r not in clash.reasons:
                        clash.reasons.append(r)
                clash.confidence = max(clash.confidence, f.confidence)
                continue
            kept.append(f)
        return kept

    def _decide(self, findings: list[Finding], profile: str, settings: Settings, confirmed: set[str]) -> None:
        allow = set(settings.allowlist)
        for f in findings:
            forced = getattr(f, "forced_action", None)
            f.action, f.needs_confirmation = (forced, False) if forced else decide(f, profile, settings.tokenize)
            if f.allowlistable and f.action != "ALLOW" and (f.fp in allow or f.fp in confirmed) and f.category not in ("fingerprint", "canary"):
                f.action, f.needs_confirmation = "ALLOW", False
                f.reasons.append("marked-safe" if f.fp in allow else "confirmed-safe-once")


def _lazy(name: str, factory):
    cache = _LAZY.get(name)
    if cache is None:
        cache = _LAZY[name] = factory()
    return cache


_LAZY: dict = {}

_default: Scanner | None = None


def get_scanner() -> Scanner:
    global _default
    if _default is None:
        _default = Scanner()
    return _default


def scan(text: str, **kw) -> ScanResult:
    return get_scanner().scan(text, **kw)
