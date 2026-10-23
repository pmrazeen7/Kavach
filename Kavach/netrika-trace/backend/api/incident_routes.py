"""Multi-Tenant Incidents & Rationale Timeline API Routes (v1)."""

import json
import logging
from aiohttp import web
from backend.auth.rbac import get_current_user_from_request, require_permission
from database.crud import (
    get_entity_detections_for_incident,
    get_incident_by_id,
    get_recent_incidents,
    log_action,
    mark_incident_reviewed,
    search_incidents,
)

logger = logging.getLogger(__name__)


@require_permission("view_incidents")
async def api_get_incidents(request: web.Request) -> web.Response:
    """GET /api/v1/incidents — List incidents for organization with query filtering."""
    try:
        user = get_current_user_from_request(request)
        org_id = user["org_id"] if user and user["role"] != "SUPER_ADMIN" else None

        try:
            limit = int(request.query.get("limit", "50"))
        except ValueError:
            return web.json_response({"error": "limit must be an integer"}, status=400)
        query_str = request.query.get("q", "").strip()
        decision = request.query.get("decision", "").strip().upper()
        if not 1 <= limit <= 100:
            return web.json_response({"error": "limit must be between 1 and 100"}, status=400)
        if len(query_str) > 256 or decision not in ("", "ALLOW", "WARN", "BLOCK"):
            return web.json_response({"error": "Invalid search query or decision"}, status=400)

        if query_str or decision:
            incidents = search_incidents(query_str=query_str, org_id=org_id, decision=decision, limit=limit)
        else:
            incidents = get_recent_incidents(limit=limit, org_id=org_id)

        data = [
            {
                "id": inc.id,
                "timestamp": inc.timestamp.isoformat() if inc.timestamp else None,
                "user_ip": inc.user_ip,
                "user_id": inc.user_id,
                "device_id": inc.device_id,
                "target_host": inc.target_host,
                "target_url": inc.target_url,
                "http_method": inc.http_method,
                "risk_score": inc.risk_score,
                "decision": inc.decision,
                "intent_label": inc.intent_label,
                "entities_json": inc.entities_json,
                "code_detected": inc.code_detected,
                "payload_size_bytes": inc.payload_size_bytes,
                "latency_ms": inc.latency_ms,
                "reviewed": inc.reviewed,
            }
            for inc in incidents
        ]
        return web.json_response(data)
    except Exception as e:
        logger.error(f"[INCIDENTS-GET] Error: {e}")
        return web.json_response({"error": str(e)}, status=500)


@require_permission("view_incidents")
async def api_get_incident_detail(request: web.Request) -> web.Response:
    """GET /api/v1/incidents/{incident_id} — Get incident timeline and forensic detail."""
    try:
        incident_id = request.match_info.get("incident_id", "")
        user = request["user"]
        org_id = user["org_id"] if user["role"] != "SUPER_ADMIN" else None
        incident = get_incident_by_id(incident_id, org_id=org_id)

        if incident is None:
            return web.json_response({"error": "Incident not found"}, status=404)

        detections = get_entity_detections_for_incident(incident_id)

        data = {
            "id": incident.id,
            "org_id": incident.org_id,
            "user_id": incident.user_id,
            "device_id": incident.device_id,
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
            "latency_ms": incident.latency_ms,
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
        logger.error(f"[INCIDENT-DETAIL] Error: {e}")
        return web.json_response({"error": str(e)}, status=500)


@require_permission("review_incidents")
async def api_mark_reviewed(request: web.Request) -> web.Response:
    """PATCH /api/v1/incidents/{incident_id} — Mark incident as reviewed with notes."""
    try:
        user = request["user"]
        incident_id = request.match_info.get("incident_id", "")
        body = await request.json()
        if not isinstance(body, dict):
            return web.json_response({"error": "Request body must be a JSON object"}, status=400)
        notes = body.get("notes", "")
        if not isinstance(notes, str) or len(notes) > 4000:
            return web.json_response({"error": "notes must be a string of at most 4000 characters"}, status=400)

        org_id = user["org_id"] if user["role"] != "SUPER_ADMIN" else None
        success = mark_incident_reviewed(incident_id, user["email"], notes, org_id=org_id)
        if success:
            log_action(action="REVIEW_INCIDENT", resource=f"INCIDENT:{incident_id}", org_id=user["org_id"], user_id=user["id"])
            return web.json_response({"status": "reviewed", "reviewed_by": user["email"]})
        return web.json_response({"error": "Incident not found"}, status=404)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@require_permission("view_incidents")
async def api_get_incident_pdf(request: web.Request) -> web.Response:
    """GET /api/v1/incidents/{incident_id}/pdf — Download PDF report."""
    try:
        incident_id = request.match_info.get("incident_id", "")
        user = request["user"]
        org_id = user["org_id"] if user["role"] != "SUPER_ADMIN" else None
        incident = get_incident_by_id(incident_id, org_id=org_id)
        if incident is None:
            return web.json_response({"error": "Incident not found"}, status=404)

        detections = get_entity_detections_for_incident(incident_id)

        from reports.pdf_builder import IncidentPDFBuilder
        builder = IncidentPDFBuilder()
        pdf_bytes = builder.build_incident_report(incident, detections)

        return web.Response(
            body=pdf_bytes,
            content_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="incident_{incident_id[:8]}.pdf"'},
        )
    except Exception as e:
        logger.error(f"[INCIDENT-PDF] Error: {e}")
        return web.json_response({"error": str(e)}, status=500)
