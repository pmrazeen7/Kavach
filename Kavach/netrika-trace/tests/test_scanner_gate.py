"""Server-side enforcement: the chat gate and the scanner API (no way around the UI)."""

import asyncio
import json
import os

os.environ.setdefault("SCANNER_HMAC_KEY", "unit-test-key")

from aiohttp.test_utils import TestClient, TestServer

from backend.main import create_app
from scanner import service
from scanner.engine import Scanner
from scanner.settings import Store

GITHUB = "ghp_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8"


def run(coro_fn):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    app = create_app()
    client = TestClient(TestServer(app, loop=loop), loop=loop)
    try:
        loop.run_until_complete(client.start_server())
        loop.run_until_complete(coro_fn(client))
        loop.run_until_complete(client.close())
    finally:
        loop.close()


async def _chat_stub(request):
    from aiohttp import web

    return web.json_response({"ok": True, "message_seen_by_model": request.get("scan_message")})


def isolate(monkeypatch):
    """In-memory scanner settings, a stub model handler, and no incident rows in the dev database."""
    monkeypatch.setattr(service, "_scanner", Scanner(Store()))
    import server.intervention_server as srv

    monkeypatch.setattr(srv, "api_chat", _chat_stub)
    created = []
    import database.crud as crud

    monkeypatch.setattr(crud, "create_incident", lambda **kw: created.append(kw))
    return created


async def token(client) -> str:
    from database.crud import seed_enterprise_defaults

    seed_enterprise_defaults()
    r = await client.post("/api/v1/auth/login", json={"email": "admin@enterprise.com", "password": "Admin@123456"})
    return (await r.json())["access_token"]


def test_chat_requires_a_signed_in_user():
    async def _t(client):
        for method, path in (("post", "/api/chat"), ("get", "/api/chat/sessions"), ("post", "/api/chat/memory-test")):
            r = await getattr(client, method)(path, json={"message": "hello"})
            assert r.status == 401, path

    run(_t)


def test_a_secret_never_reaches_the_model_even_through_the_raw_api(monkeypatch):
    created = isolate(monkeypatch)

    async def _t(client):
        tok = await token(client)
        r = await client.post("/api/chat", json={"message": "deploy with " + GITHUB}, headers={"Authorization": f"Bearer {tok}"})
        assert r.status == 422
        body = await r.json()
        assert body["blocked"] and body["scan"]["action"] == "BLOCK"
        assert GITHUB not in json.dumps(body)  # the response echoes no raw secret
        assert created and created[0]["decision"] == "BLOCK" and created[0]["payload_preview"] == ""
        assert GITHUB not in json.dumps(created[0], default=str)  # nor does the audit row

    run(_t)


def test_bare_unlabelled_token_is_blocked_at_the_gate(monkeypatch):
    isolate(monkeypatch)

    async def _t(client):
        tok = await token(client)
        r = await client.post("/api/chat", json={"message": "xyzwudguwd"}, headers={"Authorization": f"Bearer {tok}"})
        assert r.status == 422
        assert (await r.json())["scan"]["needs_confirmation"] is True

    run(_t)


def test_confirming_an_ambiguous_token_lets_that_one_through_the_gate(monkeypatch):
    isolate(monkeypatch)
    fp = service.scan_text("xyzwudguwd", deep=False).findings[0].fp

    async def _t(client):
        tok = await token(client)
        r = await client.post("/api/chat", json={"message": "xyzwudguwd", "confirmed_safe": [fp]}, headers={"Authorization": f"Bearer {tok}"})
        assert r.status == 200 and (await r.json())["ok"]  # past the gate
        r2 = await client.post("/api/chat", json={"message": GITHUB, "confirmed_safe": [service.scan_text(GITHUB, deep=False).findings[0].fp]}, headers={"Authorization": f"Bearer {tok}"})
        assert r2.status == 422  # a known-format secret can never be confirmed away

    run(_t)


def test_scan_api_returns_masked_findings_only(monkeypatch):
    isolate(monkeypatch)

    async def _t(client):
        tok = await token(client)
        h = {"Authorization": f"Bearer {tok}"}
        assert (await client.post("/api/v1/scanner/scan", json={"text": GITHUB})).status == 401
        r = await client.post("/api/v1/scanner/scan", json={"text": "key " + GITHUB}, headers=h)
        data = await r.json()
        assert data["action"] == "BLOCK" and GITHUB not in json.dumps(data)
        assert data["findings"][0]["masked"].startswith("gh") and "•" in data["findings"][0]["masked"]
        assert (await client.post("/api/v1/scanner/scan", json={"text": "x" * 300_000}, headers=h)).status == 400

    run(_t)


def test_settings_and_allowlist_flow(monkeypatch):
    isolate(monkeypatch)

    async def _t(client):
        tok = await token(client)
        h = {"Authorization": f"Bearer {tok}"}
        r = await client.patch("/api/v1/scanner/settings", json={"profile": "strict", "codenames": ["Project Falcon"], "custom_patterns": [{"name": "Emp", "pattern": r"EMP-\d+", "category": "business", "action": "REDACT"}]}, headers=h)
        s = await r.json()
        assert s["profile"] == "strict" and s["codenames"] == ["Project Falcon"]
        bad = await client.patch("/api/v1/scanner/settings", json={"custom_patterns": [{"name": "x", "pattern": "("}]}, headers=h)
        assert bad.status == 400
        fp = (await (await client.post("/api/v1/scanner/scan", json={"text": "xyzwudguwd"}, headers=h)).json())["findings"][0]["fp"]
        assert (await client.post("/api/v1/scanner/allow", json={"fp": fp}, headers=h)).status == 200
        after = await (await client.post("/api/v1/scanner/scan", json={"text": "xyzwudguwd"}, headers=h)).json()
        assert after["action"] == "ALLOW"
        assert (await client.post("/api/v1/scanner/allow", json={"fp": "short"}, headers=h)).status == 400

    run(_t)


def test_fingerprint_ingest_is_confined_to_the_source_root(monkeypatch, tmp_path):
    isolate(monkeypatch)
    from backend.api import scanner_routes

    monkeypatch.setattr(scanner_routes, "SOURCE_ROOT", tmp_path.resolve())
    (tmp_path / ".env").write_text("DB_PASSWORD=correct-horse-battery-9\n")

    async def _t(client):
        tok = await token(client)
        h = {"Authorization": f"Bearer {tok}"}
        r = await client.post("/api/v1/scanner/fingerprints/ingest", json={"paths": [str(tmp_path / ".env"), "C:/Windows/win.ini"]}, headers=h)
        rep = await r.json()
        assert rep["fingerprints"] == 1 and rep["rejected_outside_root"] == 1
        scan = await (await client.post("/api/v1/scanner/scan", json={"text": "correct-horse-battery-9"}, headers=h)).json()
        assert scan["action"] == "BLOCK" and scan["findings"][0]["category"] == "fingerprint"
        canary = await (await client.post("/api/v1/scanner/canaries", json={"label": "honeypot"}, headers=h)).json()
        assert canary["value"].startswith("sk_live_")
        again = await (await client.post("/api/v1/scanner/scan", json={"text": canary["value"]}, headers=h)).json()
        assert again["findings"][0]["category"] == "canary"

    run(_t)


def test_redact_actions_are_rewritten_before_the_model_sees_them(monkeypatch):
    isolate(monkeypatch)

    async def _t(client):
        tok = await token(client)
        r = await client.post("/api/chat", json={"message": "my aadhaar is 2345 6789 0124 ok"}, headers={"Authorization": f"Bearer {tok}"})
        seen = (await r.json())["message_seen_by_model"]
        assert r.status == 200 and "2345" not in seen and "[PII_1]" in seen

    run(_t)


def test_server_sanitize_replaces_values_with_placeholders():
    s = Scanner(Store())
    text = "my aadhaar is 2345 6789 0124 ok"
    out = service.sanitize(text, s.scan(text))
    assert "2345" not in out and "[PII_1]" in out
