"""Main Enterprise Application Entry Point for Netrika-Trace Gateway."""

import asyncio
import logging
import os
import sys
import time

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=getattr(logging, os.getenv("LOG_LEVEL", "INFO")),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

from aiohttp import web

# Ensure project root is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Eagerly load SpaCy and Presidio in the main thread to prevent thread deadlocks
try:
    import spacy
    from presidio_analyzer import AnalyzerEngine
    import pii.spacy_ner
    import pii.presidio_analyzer
except Exception as e:
    logger.warning(f"Eager load failed: {e}")

from backend.api.analytics_routes import (
    api_export_incidents_csv,
    api_get_endpoint_stats,
    api_get_compliance,
    api_get_compliance_pdf,
    api_get_stats,
    api_global_search,
)
from backend.api.auth_routes import (
    api_list_devices,
    api_login,
    api_me,
    api_refresh_token,
    api_register_device,
)
from backend.api.eval_routes import api_get_evaluations, api_run_evaluation
from backend.api.incident_routes import (
    api_get_incident_detail,
    api_get_incident_pdf,
    api_get_incidents,
    api_mark_reviewed,
)
from backend.api.policy_routes import (
    api_get_policy,
    api_sync_extension_policy,
    api_update_policy,
)

# ── CORS Middleware ────────────────────────────────────────────────

@web.middleware
async def cors_middleware(request: web.Request, handler):
    if request.method == "OPTIONS":
        return web.Response(
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Token, X-Device-ID, X-Organization-ID",
            }
        )
    response = await handler(request)
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-API-Token, X-Device-ID, X-Organization-ID"
    return response


# ── Enterprise Analyze Pipeline Endpoint ───────────────────────────

def _build_block_reason(result: dict) -> str:
    """Human-readable explanation for BLOCK/WARN decisions."""
    parts: list[str] = []

    intent = result.get("intent_label", "")
    if intent and intent not in ("SAFE", "AMBIGUOUS"):
        parts.append(f"Threat type: {intent.replace('_', ' ').title()}")

    entities = result.get("entities_found") or []
    if entities:
        entity_bits = []
        for entity in entities[:8]:
            etype = str(entity.get("type", "UNKNOWN")).replace("_", " ")
            count = entity.get("count", 1)
            entity_bits.append(f"{count}× {etype}")
        parts.append(f"Sensitive data detected: {', '.join(entity_bits)}")

    if result.get("code_detected"):
        parts.append("Source code detected in the upload")
    if result.get("secrets_detected"):
        parts.append("API keys or credentials detected")

    score = int(result.get("risk_score", 0) or 0)
    decision = result.get("decision", "ALLOW")
    if decision == "BLOCK":
        parts.append(f"Risk score {score}/100 exceeds the block threshold")
    elif decision == "WARN":
        parts.append(f"Risk score {score}/100 exceeds the warning threshold")
    elif score:
        parts.append(f"Risk score: {score}/100")

    return ". ".join(parts) if parts else f"Risk score: {score}/100"


# Entity types that trigger BLOCK for browser extension text and uploads.
BLOCK_POLICY_TYPES = {
    "AADHAAR", "PAN", "UPI_ID", "IFSC",
    "EMAIL_ADDRESS", "PHONE_NUMBER", "CREDIT_CARD",
    "SENSITIVE_AWS_KEY", "AWS_ACCESS_KEY", "AWS_KEY",
    "SENSITIVE_PRIVATE_KEY", "PRIVATE_KEY",
    "SENSITIVE_DATABASE_CRED", "DATABASE_URL", "DATABASE_CRED",
    "SENSITIVE_SECRET_KEY", "SECRET_KEY", "GENERIC_API_KEY", "API_KEY",
}

ENTITY_TYPE_ALIASES = {
    "UPI ID": "UPI_ID",
    "AWS_ACCESS_KEY": "SENSITIVE_AWS_KEY",
    "AWS_KEY": "SENSITIVE_AWS_KEY",
    "DATABASE_URL": "SENSITIVE_DATABASE_CRED",
    "DATABASE_CRED": "SENSITIVE_DATABASE_CRED",
    "PRIVATE_KEY": "SENSITIVE_PRIVATE_KEY",
    "SECRET_KEY": "SENSITIVE_SECRET_KEY",
    "GENERIC_API_KEY": "SENSITIVE_SECRET_KEY",
    "API_KEY": "SENSITIVE_SECRET_KEY",
    "JWT_TOKEN": "SENSITIVE_SECRET_KEY",
    "GITHUB_TOKEN": "SENSITIVE_SECRET_KEY",
    "SLACK_TOKEN": "SENSITIVE_SECRET_KEY",
    "BEARER_TOKEN": "SENSITIVE_SECRET_KEY",
}


def _preprocess_pdf_text(payload: str) -> str:
    """Strip PDF null-byte interleaving (UTF-16 style) so regex/NER can match."""
    if not payload:
        return ""
    import re
    t = payload.replace("\x00", "")

    def _hex_sub(m):
        clean = re.sub(r"\s", "", m.group(1))
        if len(clean) < 4 or len(clean) % 2 != 0:
            return m.group(0)
        out = []
        for i in range(0, len(clean), 2):
            code = int(clean[i:i + 2], 16)
            if 32 <= code <= 126:
                out.append(chr(code))
        return "".join(out) if len(out) >= 2 else m.group(0)

    return re.sub(r"<([0-9A-Fa-f\s]+)>", _hex_sub, t)


def _normalize_entity_type(entity_type: str) -> str:
    raw = str(entity_type or "").strip()
    upper = raw.upper().replace(" ", "_")
    return ENTITY_TYPE_ALIASES.get(raw, ENTITY_TYPE_ALIASES.get(upper, upper))


def _apply_block_policy(result: dict) -> dict:
    """Block only when policy-sensitive entities are found; ignore NER noise."""
    entities = result.get("entities_found") or []
    policy_hits = []
    seen = set()
    for entity in entities:
        canonical = _normalize_entity_type(entity.get("type", ""))
        if canonical not in BLOCK_POLICY_TYPES:
            continue
        if canonical in seen:
            continue
        seen.add(canonical)
        merged = dict(entity)
        merged["type"] = canonical
        policy_hits.append(merged)

    if policy_hits:
        summary = ", ".join(
            f"{e.get('count', 1)}× {str(e.get('type', '')).replace('_', ' ')}"
            for e in policy_hits[:8]
        )
        result["decision"] = "BLOCK"
        result["entities_found"] = policy_hits
        result["block_reason"] = f"Sensitive data detected: {summary}"
        result["risk_score"] = max(int(result.get("risk_score", 0) or 0), 85)
    else:
        result["decision"] = "ALLOW"
        result["entities_found"] = []
        result["block_reason"] = ""
    return result


async def api_analyze_enterprise(request: web.Request) -> web.Response:
    """POST /api/analyze & /api/v1/analyze — Primary Enterprise Analysis Gateway."""
    start_time = time.time()
    try:
        body = await request.json()
        payload = body.get("payload", "")
        payload = _preprocess_pdf_text(payload)
        user_ip = body.get("user_ip", "browser-extension")
        target_host = body.get("target_host", "api.openai.com")
        target_url = body.get("target_url", "https://api.openai.com/v1/chat")
        http_method = body.get("http_method", "POST")

        # Enterprise Context Headers / Body Parameters
        org_id = request.headers.get("X-Organization-ID", body.get("org_id", "default-org"))
        user_id = request.headers.get("X-User-ID", body.get("user_id", "default-user"))
        device_id = request.headers.get("X-Device-ID", body.get("device_id", "default-device"))

        if not payload or len(payload.strip()) < 2:
            return web.json_response({"error": "Payload is required"}, status=400)

        from agents.graph import run_pipeline
        loop = asyncio.get_event_loop()

        result = await loop.run_in_executor(
            None,
            lambda: run_pipeline(
                payload=payload,
                user_ip=user_ip,
                target_host=target_host,
                target_url=target_url,
                http_method=http_method,
            ),
        )

        # Extension uploads: block ONLY on policy-sensitive entities, never on NER noise
        if user_ip.startswith("browser-extension") or user_ip.startswith("extension") or user_ip == "chat-upload":
            result = _apply_block_policy(result)

        latency_ms = int((time.time() - start_time) * 1000)

        response_data = {
            "incident_id": result.get("incident_id", ""),
            "decision": result.get("decision", "ALLOW"),
            "risk_score": result.get("risk_score", 0),
            "intent_label": result.get("intent_label", ""),
            "entities_found": result.get("entities_found", []),
            "code_detected": result.get("code_detected", False),
            "secrets_detected": result.get("secrets_detected", False),
            "block_reason": _build_block_reason(result),
            "latency_ms": latency_ms,
        }

        # WebSocket live broadcast — include policy + audit entities for dashboard
        from backend.websocket.broker import broadcast_incident_event
        policy_entities = response_data.get("entities_found") or []
        audit_entities = result.get("audit_ner_entities") or []
        dashboard_entities = policy_entities + audit_entities
        await broadcast_incident_event({
            "id": response_data["incident_id"],
            "org_id": org_id,
            "user_id": user_id,
            "device_id": device_id,
            "decision": response_data["decision"],
            "risk_score": response_data["risk_score"],
            "user_ip": user_ip,
            "target_host": target_host,
            "target_url": target_url,
            "latency_ms": latency_ms,
            "timestamp": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
            "entities_found": dashboard_entities,
            "entity_detections": [
                {"entity_type": e.get("type", "UNKNOWN"), "entity_count": e.get("count", 1)}
                for e in dashboard_entities
            ],
        })

        return web.json_response(response_data)
    except Exception as e:
        logger.error(f"[ENTERPRISE-ANALYZE] Error: {e}", exc_info=True)
        return web.json_response({"error": str(e)}, status=500)


# ── Application Factory ────────────────────────────────────────────

async def api_health(request: web.Request) -> web.Response:
    """Public liveness endpoint for clients that need to detect the backend."""
    return web.json_response({"status": "ok"})


def create_app() -> web.Application:
    from database.session import ensure_data_dir, init_database
    from database.crud import seed_default_endpoints, seed_enterprise_defaults

    ensure_data_dir()
    init_database()
    seed_default_endpoints()
    seed_enterprise_defaults()

    app = web.Application(
        middlewares=[cors_middleware],
        client_max_size=10 * 1024 * 1024 + 64 * 1024,
    )
    app.router.add_get("/health", api_health)
    frontend_dist = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist")
    frontend_index = os.path.join(frontend_dist, "index.html")

    # Web & Landing
    if os.path.isfile(frontend_index):
        app.router.add_get("/", lambda r: web.FileResponse(frontend_index))
        app.router.add_get("/dashboard", lambda r: web.FileResponse(frontend_index))
        app.router.add_get("/dashboard/{tail:.*}", lambda r: web.FileResponse(frontend_index))
        app.router.add_get("/login", lambda r: web.FileResponse(frontend_index))
        app.router.add_get("/search", lambda r: web.FileResponse(frontend_index))
        app.router.add_get("/compliance", lambda r: web.FileResponse(frontend_index))
        app.router.add_get("/incidents/{tail:.*}", lambda r: web.FileResponse(frontend_index))
        assets_dir = os.path.join(frontend_dist, "assets")
        if os.path.isdir(assets_dir):
            app.router.add_static("/assets", assets_dir, name="frontend_assets")

    # SPA catch-all for client-side routes after API/static routes

    # Authentication v1
    app.router.add_post("/api/v1/auth/login", api_login)
    app.router.add_post("/api/v1/auth/refresh", api_refresh_token)
    app.router.add_post("/api/v1/auth/register-device", api_register_device)
    app.router.add_get("/api/v1/auth/me", api_me)
    app.router.add_get("/api/v1/auth/devices", api_list_devices)

    # Dynamic Policy v1
    app.router.add_get("/api/v1/policies", api_get_policy)
    app.router.add_patch("/api/v1/policies", api_update_policy)
    app.router.add_get("/api/v1/policies/extension-sync", api_sync_extension_policy)

    # Incidents v1
    app.router.add_get("/api/v1/incidents", api_get_incidents)
    app.router.add_get("/api/v1/incidents/{incident_id}", api_get_incident_detail)
    app.router.add_patch("/api/v1/incidents/{incident_id}", api_mark_reviewed)
    app.router.add_get("/api/v1/incidents/{incident_id}/pdf", api_get_incident_pdf)

    # Analytics & Search v1
    app.router.add_get("/api/v1/analytics/stats", api_get_stats)
    app.router.add_get("/api/v1/analytics/endpoints-stats", api_get_endpoint_stats)
    app.router.add_get("/api/v1/analytics/search", api_global_search)
    app.router.add_get("/api/v1/analytics/compliance", api_get_compliance)
    app.router.add_get("/api/v1/analytics/compliance/pdf", api_get_compliance_pdf)
    app.router.add_get("/api/v1/analytics/export", api_export_incidents_csv)

    # Model Evaluation v1
    app.router.add_post("/api/v1/eval/evaluate", api_run_evaluation)
    app.router.add_get("/api/v1/eval/latest", api_get_evaluations)

    # DLP Pipeline Gateway
    app.router.add_post("/api/analyze", api_analyze_enterprise)
    app.router.add_post("/api/v1/analyze", api_analyze_enterprise)

    # Document scanning and chat handlers shared with the legacy intervention server.
    from server.intervention_server import (
        api_chat,
        api_chat_memory_test,
        api_chat_sessions,
        api_chat_upload,
        api_chat_upload_respond,
        api_chat_upload_scan,
    )
    app.router.add_post("/api/chat", api_chat)
    app.router.add_post("/api/chat/upload/scan", api_chat_upload_scan)
    app.router.add_post("/api/chat/upload/respond", api_chat_upload_respond)
    app.router.add_post("/api/chat/upload", api_chat_upload)
    app.router.add_post("/api/chat/memory-test", api_chat_memory_test)
    app.router.add_get("/api/chat/sessions", api_chat_sessions)

    # Legacy Backwards Compatibility Routes
    app.router.add_get("/api/stats", api_get_stats)
    app.router.add_get("/api/compliance", api_get_compliance)
    app.router.add_get("/api/compliance/pdf", api_get_compliance_pdf)
    app.router.add_get("/api/incidents", api_get_incidents)
    app.router.add_get("/api/incidents/{incident_id}", api_get_incident_detail)
    app.router.add_patch("/api/incidents/{incident_id}", api_mark_reviewed)
    app.router.add_get("/api/incidents/{incident_id}/pdf", api_get_incident_pdf)
    app.router.add_get("/api/policy", api_get_policy)
    app.router.add_patch("/api/policy", api_update_policy)

    # WebSocket Real-Time Broker
    from backend.websocket.broker import websocket_feed_handler, websocket_policy_handler
    app.router.add_get("/ws/alerts", websocket_feed_handler)
    app.router.add_get("/ws/live-feed", websocket_feed_handler)
    app.router.add_get("/ws/policy-sync", websocket_policy_handler)

    if os.path.isfile(frontend_index):
        app.router.add_get("/{tail:.*}", lambda r: web.FileResponse(frontend_index))

    return app


def main() -> None:
    port = int(os.getenv("INTERVENTION_PORT", "8888"))
    app = create_app()
    logger.info(f"Starting Netrika-Trace Enterprise Platform on port {port}")
    web.run_app(app, host="0.0.0.0", port=port)


if __name__ == "__main__":
    main()
