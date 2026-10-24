"""Layered scanner: unit and behaviour tests (no database, no network)."""

import base64
import json
import os

import pytest

os.environ.setdefault("SCANNER_HMAC_KEY", "unit-test-key")

from scanner import validators
from scanner.engine import Scanner
from scanner.fingerprints import FingerprintStore, extract_secret_values
from scanner.files import Unscannable, extract_text
from scanner.normalize import clean, decode_views
from scanner.redact import apply as apply_redaction
from scanner.settings import Settings, Store

KEY = "sk-ant-api03-" + "Zx9QpLmN3vB7cT2wY5uK8dFhJ4sA1gR6eX0oV9bN3mK7pQ2wE5rT8yU1iO4aS6dF9gH2jK5lZ8xC1vB4nM7qW0eR3tY6uI9oP2aS5dF8gH1jK4lZ7xC0vB3nM"


@pytest.fixture()
def scanner():
    return Scanner(Store())


def action(scanner, text, **kw):
    return scanner.scan(text, **kw).action


# ── Layer 1 validators ────────────────────────────────────────────

def test_luhn_iban_gstin_pan_ssn():
    assert validators.luhn("4111 1111 1111 1111") and not validators.luhn("4111 1111 1111 1112")
    assert validators.iban("GB82 WEST 1234 5698 7654 32") and not validators.iban("GB82 WEST 1234 5698 7654 33")
    assert validators.gstin("27AAPFU0939F1ZV") and not validators.gstin("27AAPFU0939F1ZX")
    assert validators.pan("ABCPN1234F") and not validators.pan("ABCDN1234F")
    assert validators.ssn("123-45-6789") and not validators.ssn("666-45-6789")


def test_aadhaar_verhoeff():
    base = "23456789012"
    valid = next(base + str(c) for c in range(10) if validators.verhoeff(base + str(c)))
    wrong = valid[:-1] + str((int(valid[-1]) + 1) % 10)
    assert validators.verhoeff(valid) and not validators.verhoeff(wrong)


def test_jwt_structure_is_checked():
    def enc(d):
        return base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")

    good = enc({"alg": "HS256", "typ": "JWT"}) + "." + enc({"sub": "1"}) + ".sig"
    assert validators.jwt(good)
    assert not validators.jwt("eyJhbGciOi.eyJzdWIiOiIx.sig")  # decodes to junk


# ── Layer 2: bare tokens (the headline requirement) ───────────────

def test_bare_random_token_without_any_keyword_is_blocked(scanner):
    r = scanner.scan("xyzwudguwd")
    assert r.action == "BLOCK"
    f = r.findings[0]
    assert f.type == "suspicious_token" and f.needs_confirmation and "no-keyword-needed" in f.reasons


@pytest.mark.parametrize("text", [
    "hello", "kubernetes", "userName", "Please summarize the quarterly report and email it to the team.",
    "550e8400-e29b-41d4-a716-446655440000", "commit a3f5c9e1b2d4", "bg-blue-500", "v1.2.3", "report_final_v2.pdf",
    "def get_user(self, session_id):\n    return self.sessions[session_id]",
])
def test_words_identifiers_hashes_and_code_are_not_flagged(scanner, text):
    assert action(scanner, text) in ("ALLOW", "WARN")


def test_placeholders_are_not_secrets(scanner):
    for t in ["api_key=YOUR_API_KEY", "password: <password>", "token = ${TOKEN}", "Authorization: Bearer <token>", "secret=xxxxxxxxxxxx"]:
        assert action(scanner, t) == "ALLOW", t


# ── Layer 0: evasion ──────────────────────────────────────────────

@pytest.mark.parametrize("encode", [
    lambda s: base64.b64encode(s.encode()).decode(),
    lambda s: s.encode().hex(),
    lambda s: "".join(f"%{b:02x}" for b in s.encode()),
    lambda s: s[::-1],
    lambda s: " ".join(s),
    lambda s: "​".join(s[i : i + 4] for i in range(0, len(s), 4)),
    lambda s: base64.b64encode("".join(f"%{b:02x}" for b in s.encode()).encode()).decode(),
    lambda s: s[: len(s) // 2] + "\n" + s[len(s) // 2 :],
])
def test_encoded_and_obfuscated_known_secret_is_still_found(scanner, encode):
    r = scanner.scan("here you go: " + encode(KEY))
    assert r.action == "BLOCK"
    assert any(f.type == "anthropic" for f in r.findings)


def test_homoglyph_and_fullwidth_letters_are_folded(scanner):
    token = "ghp_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8"
    assert any(f.type == "github_pat" for f in scanner.scan("ghр_" + token[4:]).findings)  # Cyrillic р
    assert any(f.type == "github_pat" for f in scanner.scan("ｇｈｐ＿" + token[4:]).findings)  # full-width


def test_secret_split_across_messages_is_caught(scanner):
    r = scanner.scan(KEY[40:], history=["use this key", KEY[:20], KEY[20:40]])
    assert r.action == "BLOCK" and any(f.spans_messages for f in r.findings)


def test_leetspeak_label_still_gives_context(scanner):
    r = scanner.scan("p4ssw0rd: hunter2xyz")
    assert r.action == "BLOCK" and any(f.layer == 3 and f.start >= 10 for f in r.findings)


def test_decoding_is_depth_limited():
    text = "a" * 20
    for _ in range(8):
        text = base64.b64encode(text.encode()).decode()
    assert len(decode_views(text, depth=3)) <= 40


def test_normalize_keeps_an_index_map():
    text = "ab​cd"
    cleaned, idx = clean(text)
    assert cleaned == "abcd" and idx == [0, 1, 3, 4]


# ── Layer 4: fingerprints and canaries ────────────────────────────

def test_fingerprint_catches_a_secret_no_other_layer_would(tmp_path):
    store = Store()
    fps = FingerprintStore()
    fps.add("nimbus-prod-7731-harbor", "env:test")
    fps.add("sk_live_" + "A" * 4 + "b" * 26, "canary:t", canary=True)
    store.save_fingerprints(fps)
    s = Scanner(store)
    assert Scanner(Store()).scan("nimbus-prod-7731-harbor").action != "BLOCK"  # without the fingerprint it passes
    for text in ["nimbus-prod-7731-harbor", "our shared value is nimbus-prod-7731-harbor ok", "prefixnimbus-prod-7731-harborsuffix", " ".join("nimbus-prod-7731-harbor")]:
        r = s.scan(text)
        assert r.action == "BLOCK" and any(f.category == "fingerprint" for f in r.findings), text
    seen = []
    s.on_canary = seen.append
    assert s.scan("sk_live_" + "A" * 4 + "b" * 26).findings[0].category == "canary" and seen


def test_fingerprints_are_never_overridable(tmp_path):
    store = Store()
    fps = FingerprintStore()
    fps.add("nimbus-prod-7731-harbor", "env:test")
    store.save_fingerprints(fps)
    s = Scanner(store)
    fp = s.scan("nimbus-prod-7731-harbor").findings[0].fp
    assert s.scan("nimbus-prod-7731-harbor", confirmed=[fp]).action == "BLOCK"
    settings = store.settings()
    settings.allowlist = [fp]
    store.save_settings(settings)
    assert s.scan("nimbus-prod-7731-harbor").action == "BLOCK"


def test_env_file_ingestion_stores_hashes_not_values(tmp_path):
    env = tmp_path / ".env"
    env.write_text("DB_PASSWORD=correct-horse-battery-9\nPORT=8080\nDEBUG=true\nSTRIPE_SECRET=sk_test_abcdefghijklmnop\n")
    pairs = extract_secret_values(env)
    assert {v for _, v in pairs} == {"correct-horse-battery-9", "sk_test_abcdefghijklmnop"}
    fps = FingerprintStore()
    for label, v in pairs:
        fps.add(v, label)
    blob = fps.to_json()
    assert "correct-horse" not in blob and "sk_test" not in blob


# ── Layer 7: decisions, profiles, allowlist ───────────────────────

def test_profiles_change_the_action(scanner):
    text = "xyzwudguwd"
    assert scanner.scan(text, policy="strict").action == "BLOCK"
    assert scanner.scan(text, policy="balanced").action == "BLOCK"
    assert scanner.scan(text, policy="relaxed").action == "WARN"
    card = "pay with 4111 1111 1111 1111"
    assert scanner.scan(card, policy="relaxed").action == "REDACT"


def test_known_format_secret_cannot_be_confirmed_away(scanner):
    r = scanner.scan("ghp_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8")
    assert r.action == "BLOCK" and not r.needs_confirmation
    again = scanner.scan("ghp_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8", confirmed=[r.findings[0].fp])
    assert again.action == "BLOCK"


def test_confirm_once_and_mark_safe_unblock_only_ambiguous_tokens():
    store = Store()
    s = Scanner(store)
    r = s.scan("xyzwudguwd")
    fp = r.findings[0].fp
    assert s.scan("xyzwudguwd", confirmed=[fp]).action == "ALLOW"  # allow once
    assert s.scan("xyzwudguwd").action == "BLOCK"                  # ...but only once
    settings = store.settings()
    settings.allowlist = [fp]
    store.save_settings(settings)
    assert s.scan("xyzwudguwd").action == "ALLOW"                  # mark as safe
    assert s.scan("xyzwudguwf").action == "BLOCK"                  # a different token is still judged


def test_tokenize_vs_redact_follows_the_setting():
    store = Store()
    s = Scanner(store)
    text = "my aadhaar is 2345 6789 0124"
    assert s.scan(text).action == "TOKENIZE"
    st = store.settings()
    st.tokenize = False
    store.save_settings(st)
    assert s.scan(text).action == "REDACT"


def test_custom_patterns_hosts_and_codenames():
    store = Store()
    store.save_settings(Settings(internal_hosts=["db.corp.internal"], codenames=["Project Falcon"], custom_patterns=[{"name": "Employee ID", "pattern": r"EMP-\d{6}", "category": "business", "action": "REDACT"}]))
    s = Scanner(store)
    assert s.scan("connect to db.corp.internal now").findings[0].type == "internal_host"
    assert s.scan("status of project falcon?").findings[0].type == "codename"
    r = s.scan("badge EMP-123456")
    assert r.action == "REDACT" and r.findings[0].label == "Employee ID"


# ── Safety properties ─────────────────────────────────────────────

def test_results_never_contain_raw_values(scanner):
    r = scanner.scan("my key is " + KEY)
    blob = json.dumps(r.to_dict())
    assert KEY not in blob and KEY[20:60] not in blob


def test_redaction_removes_the_value():
    s = Scanner(Store())
    text = "card 4111 1111 1111 1111 please"
    r = s.scan(text)
    out, mapping = apply_redaction(text, r.findings, mode="placeholder")
    assert "4111" not in out and "[FINANCIAL_1]" in out and all(len(v) == 32 for v in mapping.values())


def test_huge_input_is_bounded_and_fast(scanner):
    text = ("lorem ipsum dolor sit amet " * 4000) + " ghp_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8"
    r = scanner.scan(text)
    assert r.action == "BLOCK" and r.elapsed_ms < 2000


def test_normal_prompt_is_well_inside_the_latency_budget(scanner):
    scanner.scan("warm up")
    prompt = "Please rewrite this paragraph so it sounds friendlier, and keep it under 120 words. " * 6
    worst = max(scanner.scan(prompt).elapsed_ms for _ in range(20))
    assert worst < 50, f"{worst:.1f} ms"


# ── Files ─────────────────────────────────────────────────────────

def test_files_txt_zip_docx_and_unscannable(tmp_path):
    import io
    import zipfile

    assert extract_text(b"hello", "a.txt")[0][1] == "hello"
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("notes/.env", "AWS_KEY=AKIAIOSFODNN7EXAMPLE")
    members = extract_text(buf.getvalue(), "bundle.zip")
    assert members and "AKIA" in members[0][1]
    import docx

    d = docx.Document()
    d.add_paragraph("password: hunter2xyz")
    out = io.BytesIO()
    d.save(out)
    assert "hunter2xyz" in extract_text(out.getvalue(), "n.docx")[0][1]
    with pytest.raises(Unscannable):
        extract_text(b"\x89PNG", "scan.png")
    with pytest.raises(Unscannable):
        extract_text(b"x" * (11 * 1024 * 1024), "big.txt")


def test_adversarial_inputs_do_not_cause_catastrophic_backtracking(scanner):
    import time

    probes = ["x" * 5000 + "!", "0-" * 3000, ("a" * 30 + " ") * 200, "%41" * 3000, "A" * 4000 + "=", "1 " * 3000, "<" * 2000, "\n".join("a" * 20 for _ in range(500))]
    t0 = time.perf_counter()
    for p in probes:
        scanner.scan(p)
    assert time.perf_counter() - t0 < 10
