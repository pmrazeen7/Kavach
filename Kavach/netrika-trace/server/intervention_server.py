"""Aiohttp server for serving intervention pages and API.

Runs on port 8888, serving:
- /incident/{id} — Red-screen blocked pages
- /api/incidents — JSON API for the dashboard
- /api/incidents/{id}/pdf — PDF incident report download
- /api/policy — Policy configuration CRUD
- /ws/alerts — WebSocket for real-time dashboard updates
"""

import asyncio
import json
import logging
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from aiohttp import web
import aiohttp

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=getattr(logging, os.getenv("LOG_LEVEL", "INFO")),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

logger = logging.getLogger(__name__)

# Connected WebSocket clients
ws_clients: set[web.WebSocketResponse] = set()

# After /api/chat/upload/scan, holds extracted text until /respond (low-latency two-step upload)
_CHAT_UPLOAD_PENDING: dict[str, dict] = {}
_CHAT_UPLOAD_CACHE_TTL_SEC = 900
_MAX_CACHED_DOC_CHARS = 400_000
_CHAT_UPLOAD_MAX_PDF_PAGES = int(os.getenv("CHAT_UPLOAD_MAX_PDF_PAGES", "48"))
_CHAT_UPLOAD_MAX_BYTES = 10 * 1024 * 1024
_CHAT_UPLOAD_ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".csv"}


def _prune_chat_upload_pending() -> None:
    now = time.time()
    for sid in list(_CHAT_UPLOAD_PENDING.keys()):
        entry = _CHAT_UPLOAD_PENDING.get(sid) or {}
        if now - float(entry.get("ts", 0)) > _CHAT_UPLOAD_CACHE_TTL_SEC:
            _CHAT_UPLOAD_PENDING.pop(sid, None)


def _dlp_payload_from_result(dlp_result: dict) -> dict:
    return {
        "incident_id": dlp_result.get("incident_id", ""),
        "decision": dlp_result.get("decision", "ALLOW"),
        "risk_score": dlp_result.get("risk_score", 0),
        "intent_label": dlp_result.get("intent_label", ""),
        "entities_found": dlp_result.get("entities_found", []),
        "code_detected": dlp_result.get("code_detected", False),
        "secrets_detected": dlp_result.get("secrets_detected", False),
    }


async def _broadcast_ws_background(ws_event: dict) -> None:
    try:
        await broadcast_to_websockets(ws_event)
    except Exception as e:
        logger.warning(f"[CHAT-UPLOAD] WebSocket broadcast failed: {e}")


# ── Incident Pages ─────────────────────────────────────────────────

async def handle_incident_page(request: web.Request) -> web.Response:
    """Serve the red-screen intervention page for a blocked incident."""
    incident_id = request.match_info.get("incident_id", "")

    # Try to load pre-rendered HTML
    html_path = os.path.join("data", "incidents", f"{incident_id}.html")
    if os.path.exists(html_path):
        with open(html_path, "r", encoding="utf-8") as f:
            html = f.read()
        return web.Response(text=html, content_type="text/html")

    # Generate from database if pre-rendered not available
    try:
        from db.crud import get_incident_by_id
        incident = get_incident_by_id(incident_id)
        if incident is None:
            return web.Response(
                text="<html><body><h1>Incident not found</h1></body></html>",
                content_type="text/html",
                status=404,
            )

        from simulation.page_builder import InterventionPageBuilder
        builder = InterventionPageBuilder()

        entities = []
        if incident.entities_json:
            entity_data = json.loads(incident.entities_json)
            for etype, count in entity_data.items():
                entities.append({"type": etype, "count": count})

        html = builder.render_blocked_page(
            incident_id=incident.id,
            risk_score=incident.risk_score,
            entities=entities,
            simulation_text=incident.simulation_html or "",
            decision=incident.decision,
        )
        return web.Response(text=html, content_type="text/html")

    except Exception as e:
        logger.error(f"Error serving incident page: {e}")
        return web.Response(
            text=f"<html><body><h1>Error</h1><p>{e}</p></body></html>",
            content_type="text/html",
            status=500,
        )


# ── Analyze Endpoint (Direct Testing) ─────────────────────────────

async def api_analyze(request: web.Request) -> web.Response:
    """POST /api/analyze — Run the DLP pipeline directly (for testing).

    Accepts JSON body:
      { "payload": "...", "user_ip": "...", "target_host": "...", "target_url": "..." }

    Returns the full pipeline result as JSON.
    """
    try:
        body = await request.json()
        payload = body.get("payload", "")
        user_ip = body.get("user_ip", "127.0.0.1")
        target_host = body.get("target_host", "api.openai.com")
        target_url = body.get("target_url", "https://api.openai.com/v1/chat/completions")
        http_method = body.get("http_method", "POST")

        if not payload or len(payload.strip()) < 5:
            return web.json_response({"error": "payload is required (min 5 chars)"}, status=400)

        logger.info(f"[ANALYZE] Running pipeline: {user_ip} → {target_host} ({len(payload)} chars)")

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

        # Build response
        response_data = {
            "incident_id": result.get("incident_id", ""),
            "decision": result.get("decision", "ALLOW"),
            "risk_score": result.get("risk_score", 0),
            "intent_label": result.get("intent_label", ""),
            "entities_found": result.get("entities_found", []),
            "code_detected": result.get("code_detected", False),
            "secrets_detected": result.get("secrets_detected", False),
        }

        logger.info(
            f"[ANALYZE] Result: {response_data['decision']} "
            f"(score: {response_data['risk_score']})"
        )

        # Broadcast to WebSocket clients for live dashboard updates
        ws_event = {
            "id": response_data["incident_id"],
            "decision": response_data["decision"],
            "risk_score": response_data["risk_score"],
            "user_ip": user_ip,
            "target_host": target_host,
            "target_url": target_url,
            "http_method": http_method,
            "intent_label": response_data["intent_label"],
            "entities_json": json.dumps(
                {e["type"]: e.get("count", 1) for e in response_data["entities_found"]}
                if response_data["entities_found"] else {}
            ),
            "code_detected": response_data["code_detected"],
            "timestamp": __import__("datetime").datetime.now(
                __import__("datetime").timezone.utc
            ).isoformat(),
        }
        await broadcast_to_websockets(ws_event)

        return web.json_response(response_data)

    except Exception as e:
        logger.error(f"[ANALYZE] Pipeline error: {e}", exc_info=True)
        return web.json_response({"error": str(e)}, status=500)


async def api_analyze_file(request: web.Request) -> web.Response:
    """POST /api/analyze/file — Run the DLP pipeline on an uploaded file."""
    try:
        reader = await request.multipart()
        file_bytes = None
        filename = "document"

        async for field in reader:
            if field.name == "file":
                filename = field.filename or "document"
                file_bytes = await field.read()

        if file_bytes is None:
            return web.json_response({"error": "No file uploaded"}, status=400)

        from agents.llm_service import extract_text_from_document
        from agents.graph import run_pipeline

        # 1. Extract text from the document
        text = extract_text_from_document(file_bytes, filename)

        # 2. Run DLP pipeline
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: run_pipeline(
                payload=text,
                user_ip="extension-file",
                target_host="chatgpt.com",
                target_url="document-upload",
                http_method="POST",
            ),
        )

        response_data = {
            "incident_id": result.get("incident_id", ""),
            "decision": result.get("decision", "ALLOW"),
            "risk_score": result.get("risk_score", 0),
            "entities_found": result.get("entities_found", []),
            "filename": filename
        }

        # Broadcast for dashboard
        ws_event = {
            "id": response_data["incident_id"],
            "decision": response_data["decision"],
            "risk_score": response_data["risk_score"],
            "user_ip": "extension-file",
            "target_host": "document-scan",
            "timestamp": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        }
        await broadcast_to_websockets(ws_event)

        return web.json_response(response_data)

    except Exception as e:
        logger.error(f"[ANALYZE-FILE] Error: {e}")
        return web.json_response({"error": str(e)}, status=500)


async def api_analyze_file_fast(request: web.Request) -> web.Response:
    """POST /api/analyze/file/fast — Fast DLP pipeline for browser extension scans."""
    try:
        reader = await request.multipart()
        file_bytes = None
        filename = "document"

        async for field in reader:
            if field.name == "file":
                filename = field.filename or "document"
                file_bytes = await field.read()

        if file_bytes is None:
            return web.json_response({"error": "No file uploaded"}, status=400)

        from agents.llm_service import extract_text_from_document
        from agents.graph import run_pipeline

        # Fast text extraction (limit PDF extraction to 5 pages max for quick scan)
        text = extract_text_from_document(file_bytes, filename, max_pdf_pages=5)

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: run_pipeline(
                payload=text,
                user_ip="extension-file-fast",
                target_host="chatgpt.com",
                target_url="document-scan",
                http_method="POST",
            ),
        )

        response_data = {
            "incident_id": result.get("incident_id", ""),
            "decision": result.get("decision", "ALLOW"),
            "risk_score": result.get("risk_score", 0),
            "entities_found": result.get("entities_found", []),
            "filename": filename
        }

        ws_event = {
            "id": response_data["incident_id"],
            "decision": response_data["decision"],
            "risk_score": response_data["risk_score"],
            "user_ip": "extension-file-fast",
            "target_host": "document-scan",
            "timestamp": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        }
        await broadcast_to_websockets(ws_event)

        return web.json_response(response_data)

    except Exception as e:
        logger.error(f"[ANALYZE-FILE-FAST] Error: {e}")
        return web.json_response({"error": str(e)}, status=500)


# ── REST API ───────────────────────────────────────────────────────


async def api_get_incidents(request: web.Request) -> web.Response:
    """GET /api/incidents — List recent incidents."""
    try:
        from db.crud import get_recent_incidents
        limit = int(request.query.get("limit", "50"))
        incidents = get_recent_incidents(limit=limit)

        data = [
            {
                "id": inc.id,
                "timestamp": inc.timestamp.isoformat() if inc.timestamp else None,
                "user_ip": inc.user_ip,
                "target_host": inc.target_host,
                "target_url": inc.target_url,
                "http_method": inc.http_method,
                "risk_score": inc.risk_score,
                "decision": inc.decision,
                "intent_label": inc.intent_label,
                "entities_json": inc.entities_json,
                "code_detected": inc.code_detected,
                "payload_size_bytes": inc.payload_size_bytes,
                "simulation_html": inc.simulation_html,
                "reviewed": inc.reviewed,
            }
            for inc in incidents
        ]
        return web.json_response(data)
    except Exception as e:
        logger.error(f"API error: {e}")
        return web.json_response({"error": str(e)}, status=500)


async def api_get_incident_detail(request: web.Request) -> web.Response:
    """GET /api/incidents/{id} — Get incident detail."""
    try:
        from db.crud import get_incident_by_id, get_entity_detections_for_incident
        incident_id = request.match_info.get("incident_id", "")
        incident = get_incident_by_id(incident_id)

        if incident is None:
            return web.json_response({"error": "Incident not found"}, status=404)

        detections = get_entity_detections_for_incident(incident_id)

        data = {
            "id": incident.id,
            "timestamp": incident.timestamp.isoformat() if incident.timestamp else None,
            "user_ip": incident.user_ip,
            "target_host": incident.target_host,
            "target_url": incident.target_url,
            "http_method": incident.http_method,
            "risk_score": incident.risk_score,
            "decision": incident.decision,
            "intent_label": incident.intent_label,
            "entities_json": incident.entities_json,
            "code_detected": incident.code_detected,
            "payload_size_bytes": incident.payload_size_bytes,
            "simulation_html": incident.simulation_html,
            "reviewed": incident.reviewed,
            "reviewed_by": incident.reviewed_by,
            "notes": incident.notes,
            "entity_detections": [
                {
                    "entity_type": d.entity_type,
                    "entity_count": d.entity_count,
                    "confidence_score": d.confidence_score,
                    "detector_source": d.detector_source,
                }
                for d in detections
            ],
        }
        return web.json_response(data)
    except Exception as e:
        logger.error(f"API error: {e}")
        return web.json_response({"error": str(e)}, status=500)


async def api_get_stats(request: web.Request) -> web.Response:
    """GET /api/stats — Get aggregate incident stats."""
    try:
        from db.crud import get_incident_stats, get_hourly_breakdown, get_entity_type_breakdown
        stats = get_incident_stats()
        hourly = get_hourly_breakdown()
        entity_breakdown = get_entity_type_breakdown()
        return web.json_response({
            "stats": stats,
            "hourly": hourly,
            "entity_breakdown": entity_breakdown,
        })
    except Exception as e:
        logger.error(f"API error: {e}")
        return web.json_response({"error": str(e)}, status=500)


async def api_mark_reviewed(request: web.Request) -> web.Response:
    """PATCH /api/incidents/{id} — Mark incident as reviewed."""
    try:
        from db.crud import mark_incident_reviewed
        incident_id = request.match_info.get("incident_id", "")
        body = await request.json()
        reviewed_by = body.get("reviewed_by", "admin")
        notes = body.get("notes", "")
        success = mark_incident_reviewed(incident_id, reviewed_by, notes)
        if success:
            return web.json_response({"status": "reviewed"})
        return web.json_response({"error": "Incident not found"}, status=404)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def api_get_incident_pdf(request: web.Request) -> web.Response:
    """GET /api/incidents/{id}/pdf — Download incident PDF report."""
    try:
        from db.crud import get_incident_by_id, get_entity_detections_for_incident
        from reports.pdf_builder import IncidentPDFBuilder

        incident_id = request.match_info.get("incident_id", "")
        incident = get_incident_by_id(incident_id)
        if incident is None:
            return web.json_response({"error": "Incident not found"}, status=404)

        detections = get_entity_detections_for_incident(incident_id)
        builder = IncidentPDFBuilder()
        pdf_bytes = builder.build_incident_report(incident, detections)

        return web.Response(
            body=pdf_bytes,
            content_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="incident_{incident_id[:8]}.pdf"',
            },
        )
    except Exception as e:
        logger.error(f"PDF generation error: {e}")
        return web.json_response({"error": str(e)}, status=500)


async def api_get_compliance(request: web.Request) -> web.Response:
    """GET /api/compliance — Get DPDP compliance stats."""
    try:
        from db.crud import get_weekly_compliance_stats
        stats = get_weekly_compliance_stats()
        return web.json_response(stats)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def api_get_compliance_pdf(request: web.Request) -> web.Response:
    """GET /api/compliance/pdf — Download DPDP compliance PDF."""
    try:
        from db.crud import get_weekly_compliance_stats
        from reports.pdf_builder import CompliancePDFBuilder

        stats = get_weekly_compliance_stats()
        builder = CompliancePDFBuilder()
        pdf_bytes = builder.build_compliance_report(stats)

        return web.Response(
            body=pdf_bytes,
            content_type="application/pdf",
            headers={
                "Content-Disposition": 'attachment; filename="dpdp_compliance_report.pdf"',
            },
        )
    except Exception as e:
        logger.error(f"Compliance PDF error: {e}")
        return web.json_response({"error": str(e)}, status=500)


async def api_get_policy(request: web.Request) -> web.Response:
    """GET /api/policy — Get current policy configuration."""
    try:
        config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "config.json")
        with open(config_path, "r") as f:
            config = json.load(f)
        return web.json_response(config)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def api_update_policy(request: web.Request) -> web.Response:
    """PATCH /api/policy — Update policy configuration."""
    try:
        body = await request.json()
        config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "config.json")

        with open(config_path, "r") as f:
            config = json.load(f)

        config.update(body)

        with open(config_path, "w") as f:
            json.dump(config, f, indent=2)

        return web.json_response({"status": "updated", "config": config})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def api_get_endpoints(request: web.Request) -> web.Response:
    """GET /api/endpoints — Get all AI endpoints."""
    try:
        from db.crud import get_all_endpoints
        endpoints = get_all_endpoints()
        data = [
            {
                "id": ep.id,
                "hostname": ep.hostname,
                "display_name": ep.display_name,
                "is_active": ep.is_active,
            }
            for ep in endpoints
        ]
        return web.json_response(data)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def api_add_endpoint(request: web.Request) -> web.Response:
    """POST /api/endpoints — Add a new AI endpoint."""
    try:
        from db.crud import add_endpoint
        body = await request.json()
        hostname = body.get("hostname", "")
        display_name = body.get("display_name", "")
        if not hostname:
            return web.json_response({"error": "hostname required"}, status=400)
        ep = add_endpoint(hostname, display_name)
        return web.json_response({"id": ep.id, "hostname": ep.hostname, "status": "added"})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def api_toggle_endpoint(request: web.Request) -> web.Response:
    """PATCH /api/endpoints/{id} — Toggle endpoint active status."""
    try:
        from db.crud import toggle_endpoint
        endpoint_id = int(request.match_info.get("endpoint_id", "0"))
        body = await request.json()
        is_active = body.get("is_active", True)
        success = toggle_endpoint(endpoint_id, is_active)
        if success:
            return web.json_response({"status": "updated"})
        return web.json_response({"error": "Endpoint not found"}, status=404)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def api_delete_endpoint(request: web.Request) -> web.Response:
    """DELETE /api/endpoints/{id} — Remove an AI endpoint."""
    try:
        from db.crud import delete_endpoint
        endpoint_id = int(request.match_info.get("endpoint_id", "0"))
        success = delete_endpoint(endpoint_id)
        if success:
            return web.json_response({"status": "deleted"})
        return web.json_response({"error": "Endpoint not found"}, status=404)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def api_endpoint_stats(request: web.Request) -> web.Response:
    """GET /api/endpoints/stats — Get incident stats per endpoint."""
    try:
        from db.crud import get_endpoint_incident_stats
        stats = get_endpoint_incident_stats()
        return web.json_response(stats)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


# ── Chat / LLM Endpoints ──────────────────────────────────────────


async def api_chat(request: web.Request) -> web.Response:
    """POST /api/chat — Send a message through DLP pipeline + LLM."""
    try:
        body = await request.json()
        message = body.get("message", "")
        session_id = body.get("session_id", "")

        if not message or len(message.strip()) < 2:
            return web.json_response({"error": "message is required"}, status=400)

        # The scanner gate (backend/scanner_gate.py) may have rewritten the message (REDACT / TOKENIZE).
        message = request.get("scan_message", message)

        from agents.llm_service import chat_with_llm, create_session, get_session_history

        # Create session if not provided
        if not session_id:
            session_id = create_session()
        prior_user_messages = [m["content"] for m in get_session_history(session_id) if m.get("role") == "user"][-6:]

        # 1. Run DLP pipeline on the user's message
        from agents.graph import run_pipeline

        user_ip = body.get("user_ip", "chat-ui")
        target_host = "gemini.google.com"
        target_url = "https://generativelanguage.googleapis.com/v1/chat"

        loop = asyncio.get_event_loop()
        dlp_result = await loop.run_in_executor(
            None,
            lambda: run_pipeline(
                payload=message,
                user_ip=user_ip,
                target_host=target_host,
                target_url=target_url,
                http_method="POST",
                history=prior_user_messages,
            ),
        )

        dlp_data = {
            "incident_id": dlp_result.get("incident_id", ""),
            "decision": dlp_result.get("decision", "ALLOW"),
            "risk_score": dlp_result.get("risk_score", 0),
            "intent_label": dlp_result.get("intent_label", ""),
            "entities_found": dlp_result.get("entities_found", []),
            "code_detected": dlp_result.get("code_detected", False),
            "secrets_detected": dlp_result.get("secrets_detected", False),
        }

        # Broadcast DLP incident to WebSocket for dashboard
        ws_event = {
            "id": dlp_data["incident_id"],
            "decision": dlp_data["decision"],
            "risk_score": dlp_data["risk_score"],
            "user_ip": user_ip,
            "target_host": target_host,
            "target_url": target_url,
            "http_method": "POST",
            "intent_label": dlp_data["intent_label"],
            "entities_json": json.dumps(
                {e["type"]: e.get("count", 1) for e in dlp_data["entities_found"]}
                if dlp_data["entities_found"] else {}
            ),
            "code_detected": dlp_data["code_detected"],
            "timestamp": __import__("datetime").datetime.now(
                __import__("datetime").timezone.utc
            ).isoformat(),
        }
        await broadcast_to_websockets(ws_event)

        # 2. Forward to LLM (even if warned, block only if BLOCK)
        llm_response = ""
        if dlp_data["decision"] == "BLOCK":
            llm_response = (
                "⚠️ Your message was BLOCKED by the DLP system. "
                "Sensitive data (risk score: {}) was detected. "
                "The message was not sent to the AI model."
            ).format(dlp_data["risk_score"])
        else:
            llm_response = await loop.run_in_executor(
                None,
                lambda: chat_with_llm(message, session_id),
            )

        # Scan the model's reply too, so it cannot echo or invent data that must not leave.
        output_flagged = 0
        if dlp_data["decision"] != "BLOCK":
            try:
                from scanner import service as _scanner_service
                from scanner.redact import apply as _apply_redaction

                out_scan = await loop.run_in_executor(None, lambda: _scanner_service.scan_text(llm_response, deep=False))
                if _scanner_service.get_store().settings().scan_output and out_scan.action in ("BLOCK", "REDACT", "TOKENIZE"):
                    flagged = [f for f in out_scan.findings if f.action in ("BLOCK", "REDACT", "TOKENIZE")]
                    output_flagged = len(flagged)
                    llm_response, _ = _apply_redaction(llm_response, flagged, mode="mask")
            except Exception as exc:
                logger.error(f"[CHAT] output scan failed: {exc}")
        dlp_data["output_flagged"] = output_flagged

        return web.json_response({
            "session_id": session_id,
            "message": message,
            "response": llm_response,
            "dlp": dlp_data,
        })

    except Exception as e:
        logger.error(f"[CHAT] Error: {e}", exc_info=True)
        return web.json_response({"error": str(e)}, status=500)


async def api_chat_upload_scan(request: web.Request) -> web.Response:
    """POST /api/chat/upload/scan — Extract text + DLP only (returns before LLM).

    UI should call POST /api/chat/upload/respond next with the same session_id
    to generate the assistant reply. This splits perceived latency: sensitive
    data verdict appears as soon as the scan finishes.
    """
    try:
        _prune_chat_upload_pending()
        if request.content_type != "multipart/form-data":
            return web.json_response(
                {"error": "Upload must use multipart/form-data"},
                status=400,
            )
        reader = await request.multipart()

        file_bytes = None
        filename = ""
        session_id = ""

        async for field in reader:
            if field.name == "file":
                filename = field.filename or "upload.txt"
                file_bytes = await field.read()
            elif field.name == "session_id":
                session_id = (await field.read()).decode("utf-8")

        if file_bytes is None:
            return web.json_response({"error": "No file uploaded"}, status=400)
        if len(file_bytes) > _CHAT_UPLOAD_MAX_BYTES:
            return web.json_response({"error": "Document must be 10 MB or smaller"}, status=413)
        if os.path.splitext(filename)[1].lower() not in _CHAT_UPLOAD_ALLOWED_EXTENSIONS:
            return web.json_response({"error": "Supported document types are PDF, DOCX, TXT, and CSV"}, status=400)

        from agents.llm_service import extract_text_from_document, create_session
        from agents.graph import run_pipeline

        if not session_id:
            session_id = create_session()

        extracted_text = extract_text_from_document(
            file_bytes,
            filename,
            max_pdf_pages=_CHAT_UPLOAD_MAX_PDF_PAGES,
        )

        if not extracted_text or len(extracted_text.strip()) < 5:
            return web.json_response({"error": "Could not extract text from document"}, status=400)

        loop = asyncio.get_event_loop()
        dlp_result = await loop.run_in_executor(
            None,
            lambda: run_pipeline(
                payload=extracted_text,
                user_ip="chat-upload",
                target_host="gemini.google.com",
                target_url="https://generativelanguage.googleapis.com/v1/chat",
                http_method="POST",
            ),
        )

        dlp_data = _dlp_payload_from_result(dlp_result)

        ws_event = {
            "id": dlp_data["incident_id"],
            "decision": dlp_data["decision"],
            "risk_score": dlp_data["risk_score"],
            "user_ip": "chat-upload",
            "target_host": "gemini.google.com",
            "target_url": "document-upload",
            "http_method": "POST",
            "intent_label": dlp_data["intent_label"],
            "entities_json": json.dumps(
                {e["type"]: e.get("count", 1) for e in dlp_data["entities_found"]}
                if dlp_data["entities_found"] else {}
            ),
            "code_detected": dlp_data["code_detected"],
            "timestamp": __import__("datetime").datetime.now(
                __import__("datetime").timezone.utc
            ).isoformat(),
        }
        asyncio.create_task(_broadcast_ws_background(ws_event))
        from backend.websocket.broker import broadcast_incident_event
        await broadcast_incident_event(ws_event)

        if dlp_data["decision"] != "BLOCK":
            text_for_llm = extracted_text[:_MAX_CACHED_DOC_CHARS]
            _CHAT_UPLOAD_PENDING[session_id] = {
                "ts": time.time(),
                "filename": filename,
                "text": text_for_llm,
                "decision": dlp_data["decision"],
            }

        return web.json_response(
            {
                "session_id": session_id,
                "filename": filename,
                "extracted_text_preview": extracted_text[:500],
                "dlp": dlp_data,
                "blocked": dlp_data["decision"] == "BLOCK",
            }
        )

    except Exception as e:
        logger.error(f"[CHAT-UPLOAD-SCAN] Error: {e}", exc_info=True)
        return web.json_response({"error": str(e)}, status=500)


async def api_chat_upload_respond(request: web.Request) -> web.Response:
    """POST /api/chat/upload/respond — LLM summary for a prior /scan (JSON body)."""
    try:
        body = await request.json()
        session_id = body.get("session_id", "").strip()
        if not session_id:
            return web.json_response({"error": "session_id is required"}, status=400)

        entry = _CHAT_UPLOAD_PENDING.pop(session_id, None)
        if not entry:
            return web.json_response(
                {"error": "No pending upload for this session. Upload and scan again."},
                status=400,
            )

        from agents.llm_service import chat_with_llm

        filename = entry.get("filename", "document")
        extracted_text = entry.get("text", "")
        decision = entry.get("decision", "ALLOW")

        if decision == "BLOCK":
            llm_response = (
                f"⚠️ The document '{filename}' was BLOCKED by the DLP system. "
                f"Sensitive data was detected. The document content was not sent to the AI model."
            )
            return web.json_response({"session_id": session_id, "response": llm_response})

        prompt = (
            f"I've uploaded a document named '{filename}'. Here's its content:\n\n"
            f"{extracted_text[:3000]}\n\nPlease analyze and summarize this document."
        )

        loop = asyncio.get_event_loop()
        llm_response = await loop.run_in_executor(
            None,
            lambda: chat_with_llm(prompt, session_id),
        )

        return web.json_response({"session_id": session_id, "response": llm_response})

    except Exception as e:
        logger.error(f"[CHAT-UPLOAD-RESPOND] Error: {e}", exc_info=True)
        return web.json_response({"error": str(e)}, status=500)


async def api_chat_upload(request: web.Request) -> web.Response:
    """POST /api/chat/upload — One-shot upload (optimized; UI prefers scan+respond)."""
    try:
        reader = await request.multipart()

        file_bytes = None
        filename = ""
        session_id = ""

        async for field in reader:
            if field.name == "file":
                filename = field.filename or "upload.txt"
                file_bytes = await field.read()
            elif field.name == "session_id":
                session_id = (await field.read()).decode("utf-8")

        if file_bytes is None:
            return web.json_response({"error": "No file uploaded"}, status=400)

        from agents.llm_service import extract_text_from_document, chat_with_llm, create_session
        from agents.graph import run_pipeline

        if not session_id:
            session_id = create_session()

        extracted_text = extract_text_from_document(
            file_bytes,
            filename,
            max_pdf_pages=_CHAT_UPLOAD_MAX_PDF_PAGES,
        )

        if not extracted_text or len(extracted_text.strip()) < 5:
            return web.json_response({"error": "Could not extract text from document"}, status=400)

        loop = asyncio.get_event_loop()
        dlp_result = await loop.run_in_executor(
            None,
            lambda: run_pipeline(
                payload=extracted_text,
                user_ip="chat-upload",
                target_host="gemini.google.com",
                target_url="https://generativelanguage.googleapis.com/v1/chat",
                http_method="POST",
            ),
        )

        dlp_data = _dlp_payload_from_result(dlp_result)

        ws_event = {
            "id": dlp_data["incident_id"],
            "decision": dlp_data["decision"],
            "risk_score": dlp_data["risk_score"],
            "user_ip": "chat-upload",
            "target_host": "gemini.google.com",
            "target_url": "document-upload",
            "http_method": "POST",
            "intent_label": dlp_data["intent_label"],
            "entities_json": json.dumps(
                {e["type"]: e.get("count", 1) for e in dlp_data["entities_found"]}
                if dlp_data["entities_found"] else {}
            ),
            "code_detected": dlp_data["code_detected"],
            "timestamp": __import__("datetime").datetime.now(
                __import__("datetime").timezone.utc
            ).isoformat(),
        }
        asyncio.create_task(_broadcast_ws_background(ws_event))

        llm_response = ""
        prompt = (
            f"I've uploaded a document named '{filename}'. Here's its content:\n\n"
            f"{extracted_text[:3000]}\n\nPlease analyze and summarize this document."
        )

        if dlp_data["decision"] == "BLOCK":
            llm_response = (
                f"⚠️ The document '{filename}' was BLOCKED by the DLP system. "
                f"Sensitive data (risk score: {dlp_data['risk_score']}) was detected. "
                f"The document content was not sent to the AI model."
            )
        else:
            llm_response = await loop.run_in_executor(
                None,
                lambda: chat_with_llm(prompt, session_id),
            )

        return web.json_response(
            {
                "session_id": session_id,
                "filename": filename,
                "extracted_text_preview": extracted_text[:500],
                "response": llm_response,
                "dlp": dlp_data,
            }
        )

    except Exception as e:
        logger.error(f"[CHAT-UPLOAD] Error: {e}", exc_info=True)
        return web.json_response({"error": str(e)}, status=500)


async def api_chat_memory_test(request: web.Request) -> web.Response:
    """POST /api/chat/memory-test — Prove digital Alzheimer's."""
    try:
        body = await request.json()
        previous_session_id = body.get("previous_session_id", "")

        if not previous_session_id:
            return web.json_response({"error": "previous_session_id is required"}, status=400)

        from agents.llm_service import run_memory_test

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: run_memory_test(previous_session_id),
        )

        return web.json_response(result)

    except Exception as e:
        logger.error(f"[MEMORY-TEST] Error: {e}", exc_info=True)
        return web.json_response({"error": str(e)}, status=500)


async def api_chat_sessions(request: web.Request) -> web.Response:
    """GET /api/chat/sessions — List all chat sessions."""
    try:
        from agents.llm_service import list_sessions
        return web.json_response(list_sessions())
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


# ── WebSocket ──────────────────────────────────────────────────────

async def websocket_handler(request: web.Request) -> web.WebSocketResponse:
    """WebSocket endpoint for real-time dashboard updates."""
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    ws_clients.add(ws)
    logger.info(f"WebSocket client connected ({len(ws_clients)} total)")

    try:
        async for msg in ws:
            if msg.type == aiohttp.WSMsgType.TEXT:
                # Client can send commands (future use)
                pass
            elif msg.type in (aiohttp.WSMsgType.ERROR, aiohttp.WSMsgType.CLOSE):
                break
    finally:
        ws_clients.discard(ws)
        logger.info(f"WebSocket client disconnected ({len(ws_clients)} total)")

    return ws


async def broadcast_to_websockets(data: dict) -> None:
    """Broadcast an event to all connected WebSocket clients."""
    if not ws_clients:
        return
    message = json.dumps(data)
    closed = set()
    for ws in ws_clients:
        try:
            await ws.send_str(message)
        except Exception:
            closed.add(ws)
    ws_clients.difference_update(closed)


async def redis_listener(app: web.Application) -> None:
    """Background task that listens for Redis pub/sub events."""
    try:
        import redis.asyncio as aioredis
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        r = aioredis.from_url(redis_url)
        pubsub = r.pubsub()
        await pubsub.subscribe("netrika:incidents")
        logger.info("Redis listener started")

        async for message in pubsub.listen():
            if message["type"] == "message":
                try:
                    data = json.loads(message["data"])
                    await broadcast_to_websockets(data)
                except json.JSONDecodeError:
                    pass
    except Exception as e:
        logger.warning(f"Redis listener failed: {e}. WebSocket updates via polling only.")


async def start_background_tasks(app: web.Application) -> None:
    """Start background tasks on app startup."""
    app["redis_listener"] = asyncio.create_task(redis_listener(app))


async def cleanup_background_tasks(app: web.Application) -> None:
    """Clean up background tasks on app shutdown."""
    if "redis_listener" in app:
        app["redis_listener"].cancel()
        try:
            await app["redis_listener"]
        except asyncio.CancelledError:
            pass


# ── CORS Middleware ────────────────────────────────────────────────

@web.middleware
async def cors_middleware(request: web.Request, handler):
    """Add CORS headers for frontend development."""
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


# ── App Setup ──────────────────────────────────────────────────────

def create_app() -> web.Application:
    """Create and configure the aiohttp application."""
    from db.session import ensure_data_dir, init_database
    from db.crud import seed_default_endpoints, seed_enterprise_defaults

    ensure_data_dir()
    init_database()
    seed_default_endpoints()
    seed_enterprise_defaults()

    app = web.Application(middlewares=[cors_middleware])
    frontend_dist = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist")

    # Intervention pages
    app.router.add_get("/", lambda r: web.FileResponse("landing.html"))
    app.router.add_get("/dashboard", lambda r: web.FileResponse(os.path.join(frontend_dist, "index.html")))
    app.router.add_get("/dashboard/{tail:.*}", lambda r: web.FileResponse(os.path.join(frontend_dist, "index.html")))
    app.router.add_get("/login", lambda r: web.FileResponse(os.path.join(frontend_dist, "index.html")))
    app.router.add_get("/search", lambda r: web.FileResponse(os.path.join(frontend_dist, "index.html")))
    app.router.add_get("/compliance", lambda r: web.FileResponse(os.path.join(frontend_dist, "index.html")))
    app.router.add_get("/incidents/{tail:.*}", lambda r: web.FileResponse(os.path.join(frontend_dist, "index.html")))
    app.router.add_static("/assets", os.path.join(frontend_dist, "assets"), name="frontend_assets")
    app.router.add_get("/incident/{incident_id}", handle_incident_page)

    # Direct test endpoints
    app.router.add_post("/api/analyze", api_analyze)
    app.router.add_post("/api/v1/analyze", api_analyze)
    app.router.add_post("/api/analyze/file", api_analyze_file)
    app.router.add_post("/api/analyze/file/fast", api_analyze_file_fast)

    # REST API (v0 legacy)
    app.router.add_get("/api/incidents", api_get_incidents)
    app.router.add_get("/api/incidents/{incident_id}", api_get_incident_detail)
    app.router.add_patch("/api/incidents/{incident_id}", api_mark_reviewed)
    app.router.add_get("/api/incidents/{incident_id}/pdf", api_get_incident_pdf)
    app.router.add_get("/api/stats", api_get_stats)
    app.router.add_get("/api/compliance", api_get_compliance)
    app.router.add_get("/api/compliance/pdf", api_get_compliance_pdf)
    app.router.add_get("/api/policy", api_get_policy)
    app.router.add_patch("/api/policy", api_update_policy)
    app.router.add_get("/api/endpoints", api_get_endpoints)
    app.router.add_post("/api/endpoints", api_add_endpoint)
    app.router.add_patch("/api/endpoints/{endpoint_id}", api_toggle_endpoint)
    app.router.add_delete("/api/endpoints/{endpoint_id}", api_delete_endpoint)
    app.router.add_get("/api/endpoints/stats", api_endpoint_stats)

    # Enterprise v1 API Routes (For React SOC UI)
    from backend.api.auth_routes import (
        api_login,
        api_refresh_token,
        api_register_device,
        api_me,
        api_list_devices,
    )
    from backend.api.policy_routes import api_sync_extension_policy
    from backend.api.analytics_routes import (
        api_global_search,
        api_export_incidents_csv,
    )
    from backend.api.eval_routes import api_run_evaluation, api_get_evaluations
    from backend.websocket.broker import websocket_feed_handler, websocket_policy_handler

    app.router.add_post("/api/v1/auth/login", api_login)
    app.router.add_post("/api/v1/auth/refresh", api_refresh_token)
    app.router.add_post("/api/v1/auth/register-device", api_register_device)
    app.router.add_get("/api/v1/auth/me", api_me)
    app.router.add_get("/api/v1/auth/devices", api_list_devices)

    app.router.add_get("/api/v1/policies", api_get_policy)
    app.router.add_patch("/api/v1/policies", api_update_policy)
    app.router.add_get("/api/v1/policies/extension-sync", api_sync_extension_policy)

    app.router.add_get("/api/v1/incidents", api_get_incidents)
    app.router.add_get("/api/v1/incidents/{incident_id}", api_get_incident_detail)
    app.router.add_patch("/api/v1/incidents/{incident_id}", api_mark_reviewed)
    app.router.add_get("/api/v1/incidents/{incident_id}/pdf", api_get_incident_pdf)

    app.router.add_get("/api/v1/analytics/stats", api_get_stats)
    app.router.add_get("/api/v1/analytics/search", api_global_search)
    app.router.add_get("/api/v1/analytics/compliance", api_get_compliance)
    app.router.add_get("/api/v1/analytics/compliance/pdf", api_get_compliance_pdf)
    app.router.add_get("/api/v1/analytics/export", api_export_incidents_csv)
    app.router.add_get("/api/v1/analytics/endpoints-stats", api_endpoint_stats)

    app.router.add_post("/api/v1/eval/evaluate", api_run_evaluation)
    app.router.add_get("/api/v1/eval/latest", api_get_evaluations)

    # Chat / LLM
    app.router.add_post("/api/chat", api_chat)
    app.router.add_post("/api/chat/upload/scan", api_chat_upload_scan)
    app.router.add_post("/api/chat/upload/respond", api_chat_upload_respond)
    app.router.add_post("/api/chat/upload", api_chat_upload)
    app.router.add_post("/api/chat/memory-test", api_chat_memory_test)
    app.router.add_get("/api/chat/sessions", api_chat_sessions)

    # WebSocket Brokers
    app.router.add_get("/ws/alerts", websocket_handler)
    app.router.add_get("/ws/live-feed", websocket_feed_handler)
    app.router.add_get("/ws/policy-sync", websocket_policy_handler)

    # Background tasks
    app.on_startup.append(start_background_tasks)
    app.on_cleanup.append(cleanup_background_tasks)

    return app


def main() -> None:
    """Start the intervention server."""
    port = int(os.getenv("INTERVENTION_PORT", "8888"))
    app = create_app()
    logger.info(f"Starting intervention server on port {port}")
    web.run_app(app, host="0.0.0.0", port=port)


if __name__ == "__main__":
    main()
