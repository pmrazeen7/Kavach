"""Enterprise Multi-Tenant API Integration Tests."""

import asyncio
import pytest
from backend.main import create_app
from aiohttp.test_utils import TestClient, TestServer


def run_test(test_coro):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    app = create_app()
    server = TestServer(app, loop=loop)
    client = TestClient(server, loop=loop)
    try:
        loop.run_until_complete(client.start_server())
        loop.run_until_complete(test_coro(client))
        loop.run_until_complete(client.close())
    finally:
        loop.close()


def test_auth_login_success():
    """Test successful enterprise admin login."""
    async def _test(client):
        from database.crud import seed_enterprise_defaults
        seed_enterprise_defaults()
        resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "admin@enterprise.com", "password": "Admin@123456"}
        )
        assert resp.status == 200
        data = await resp.json()
        assert "access_token" in data
        assert data["user"]["email"] == "admin@enterprise.com"
        assert data["user"]["role"] == "SUPER_ADMIN"

    run_test(_test)


def test_device_registration():
    """Test browser extension device registration."""
    async def _test(client):
        resp = await client.post(
            "/api/v1/auth/register-device",
            json={
                "device_uuid": "test-uuid-1234",
                "org_id": "test-org-id",
                "os": "macOS",
                "browser": "Chrome",
                "ext_version": "5.0"
            }
        )
        assert resp.status == 200
        data = await resp.json()
        assert data["status"] == "registered"
        assert data["device_uuid"] == "test-uuid-1234"

    run_test(_test)


def test_unauthorized_policy_update():
    """Test RBAC blocks unauthorized policy updates."""
    async def _test(client):
        resp = await client.patch(
            "/api/v1/policies",
            json={"block_threshold": 90}
        )
        assert resp.status == 401
        data = await resp.json()
        assert "error" in data

    run_test(_test)


def test_unauthorized_dashboard_stats():
    async def _test(client):
        resp = await client.get("/api/v1/analytics/stats")
        assert resp.status == 401

    run_test(_test)


def test_public_health_endpoint():
    async def _test(client):
        resp = await client.get("/health")
        assert resp.status == 200
        assert await resp.json() == {"status": "ok"}

    run_test(_test)


def test_extension_policy_blocks_common_pii_types():
    from backend.main import _apply_block_policy

    for entity_type in ("AADHAAR", "PAN", "EMAIL_ADDRESS", "PHONE_NUMBER", "CREDIT_CARD"):
        result = _apply_block_policy({
            "decision": "ALLOW",
            "risk_score": 0,
            "entities_found": [{"type": entity_type, "count": 1}],
        })
        assert result["decision"] == "BLOCK"
        assert result["entities_found"][0]["type"] == entity_type


async def _auth_headers(client):
    """Chat endpoints now require a signed-in user (see backend/scanner_gate.py)."""
    from database.crud import seed_enterprise_defaults

    seed_enterprise_defaults()
    resp = await client.post("/api/v1/auth/login", json={"email": "admin@enterprise.com", "password": "Admin@123456"})
    return {"Authorization": f"Bearer {(await resp.json())['access_token']}"}


def test_document_upload_routes_validate_files():
    async def _test(client):
        from aiohttp import FormData

        headers = await _auth_headers(client)
        form = FormData()
        form.add_field(
            "file",
            b"content",
            filename="payload.exe",
            content_type="application/octet-stream",
        )
        unsupported = await client.post(
            "/api/chat/upload/scan",
            data=form,
            headers=headers,
        )
        assert unsupported.status == 400
        assert "Supported document types" in (await unsupported.json())["error"]

        missing_form = FormData()
        missing_form.add_field("other", b"content", filename="other.txt")
        missing = await client.post("/api/chat/upload/scan", data=missing_form, headers=headers)
        assert missing.status == 400
        assert (await missing.json())["error"] == "No file uploaded"

        invalid_content_type = await client.post(
            "/api/chat/upload/scan",
            data={"session_id": "test"},
            headers=headers,
        )
        assert invalid_content_type.status == 400
        assert (await invalid_content_type.json())["error"] == "Upload must use multipart/form-data"

    run_test(_test)


def test_document_upload_scan_and_respond():
    async def _test(client):
        from aiohttp import FormData
        from unittest.mock import patch

        form = FormData()
        form.add_field(
            "file",
            b"safe document",
            filename="report.txt",
            content_type="text/plain",
        )
        with (
            patch("agents.llm_service.extract_text_from_document", return_value="Extracted report text"),
            patch("agents.llm_service.create_session", return_value="upload-session"),
            patch(
                "agents.graph.run_pipeline",
                return_value={
                    "incident_id": "upload-incident",
                    "decision": "ALLOW",
                    "risk_score": 0,
                    "intent_label": "SAFE",
                    "entities_found": [],
                    "code_detected": False,
                    "secrets_detected": False,
                },
            ),
        ):
            scan = await client.post("/api/chat/upload/scan", data=form)

        assert scan.status == 200
        scan_data = await scan.json()
        assert scan_data["session_id"] == "upload-session"
        assert scan_data["extracted_text_preview"] == "Extracted report text"
        assert scan_data["blocked"] is False
        assert scan_data["dlp"]["incident_id"] == "upload-incident"

        with patch("agents.llm_service.chat_with_llm", return_value="Document summary"):
            respond = await client.post(
                "/api/chat/upload/respond",
                json={"session_id": "upload-session"},
            )
        assert respond.status == 200
        assert (await respond.json())["response"] == "Document summary"


def test_dlp_analyze_endpoint():
    """Test the core DLP scanning pipeline via the Enterprise API."""
    async def _test(client):
        resp = await client.post(
            "/api/v1/analyze",
            headers={"X-Organization-ID": "test-org", "X-Device-ID": "test-device"},
            json={
                "payload": "My password is Password123! and my SSN is 123-45-6789.",
                "target_host": "api.openai.com",
                "target_url": "https://api.openai.com/v1/chat",
                "http_method": "POST"
            }
        )
        assert resp.status == 200
        data = await resp.json()
        assert "incident_id" in data
        assert data["decision"] in ["BLOCK", "WARN", "ALLOW"]
        assert "latency_ms" in data
        assert "payload_preview" not in data
        from database.crud import get_incident_by_id
        incident = get_incident_by_id(data["incident_id"])
        assert incident is not None
        assert incident.payload_preview == ""

        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "admin@enterprise.com", "password": "Admin@123456"},
        )
        token = (await login_resp.json())["access_token"]
        auth_headers = {"Authorization": f"Bearer {token}"}
        review = await client.patch(
            f"/api/v1/incidents/{data['incident_id']}",
            headers=auth_headers,
            json={"notes": "Document scan reviewed"},
        )
        assert review.status == 200

        detail = await client.get(
            f"/api/v1/incidents/{data['incident_id']}",
            headers=auth_headers,
        )
        detail_data = await detail.json()
        assert detail_data["reviewed"] is True
        assert detail_data["notes"] == "Document scan reviewed"

    run_test(_test)


def test_dashboard_stats_do_not_include_model_benchmarks():
    """Model evaluation metrics belong to the evaluation endpoint, not traffic stats."""
    async def _test(client):
        from database.crud import save_model_evaluation

        save_model_evaluation(
            model_version="LangGraph-Netrika-v5.2",
            dataset_name="Enterprise-Threat-Benchmark-v1",
            precision=0.91,
            recall=0.87,
            f1_score=0.89,
            confusion_matrix={"TP": 10, "FP": 1, "TN": 15, "FN": 2},
            org_id="test-org",
        )

        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "admin@enterprise.com", "password": "Admin@123456"},
        )
        token = (await login_resp.json())["access_token"]
        auth_headers = {"Authorization": f"Bearer {token}"}

        resp = await client.get("/api/v1/analytics/stats", headers=auth_headers)
        assert resp.status == 200
        data = await resp.json()
        assert "benchmark" not in data
        assert data["window"] == "24h"

        expected_buckets = {"1h": 61, "24h": 25, "7d": 169, "30d": 31}
        for window, bucket_count in expected_buckets.items():
            range_resp = await client.get(
                f"/api/v1/analytics/stats?window={window}",
                headers=auth_headers,
            )
            assert range_resp.status == 200
            range_data = await range_resp.json()
            assert range_data["window"] == window
            assert len(range_data["hourly"]) == bucket_count

        invalid_range_resp = await client.get(
            "/api/v1/analytics/stats?window=all",
            headers=auth_headers,
        )
        assert invalid_range_resp.status == 400

        eval_resp = await client.get("/api/v1/eval/latest", headers=auth_headers)
        assert eval_resp.status == 200
        eval_data = await eval_resp.json()
        assert eval_data[0]["dataset_name"] == "Enterprise-Threat-Benchmark-v1"
        assert eval_data[0]["precision"] == 0.91
        assert eval_data[0]["recall"] == 0.87
        assert eval_data[0]["f1_score"] == 0.89

    run_test(_test)


def test_evaluation_requires_real_label_arrays():
    async def _test(client):
        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "admin@enterprise.com", "password": "Admin@123456"},
        )
        token = (await login_resp.json())["access_token"]
        resp = await client.post(
            "/api/v1/eval/evaluate",
            headers={"Authorization": f"Bearer {token}"},
            json={"model_version": "test", "dataset_name": "synthetic"},
        )
        assert resp.status == 400

    run_test(_test)
