import csv
import io
import logging
from aiohttp import web
from backend.auth.rbac import get_current_user_from_request, require_permission
from database.crud import (
    get_entity_type_breakdown,
    get_endpoint_incident_stats,
    get_traffic_breakdown,
    get_incident_stats,
    get_recent_incidents,
    get_weekly_compliance_stats,
    search_incidents,
)
logger = logging.getLogger(__name__)


@require_permission("view_analytics")
async def api_get_stats(request: web.Request) -> web.Response:
    """GET /api/v1/analytics/stats — SOC Dashboard aggregate stats."""
    try:
        user = get_current_user_from_request(request)
        org_id = user["org_id"] if user and user["role"] != "SUPER_ADMIN" else None

        window = request.query.get("window", "24h")
        if window not in ("1h", "24h", "7d", "30d"):
            return web.json_response(
                {"error": "window must be one of 1h, 24h, 7d, or 30d"},
                status=400,
            )
        stats = get_incident_stats(org_id=org_id, window=window)
        hourly = get_traffic_breakdown(window=window, org_id=org_id)
        entity_breakdown = get_entity_type_breakdown(org_id=org_id)
        return web.json_response({
            "stats": stats,
            "hourly": hourly,
            "entity_breakdown": entity_breakdown,
            "window": window,
        })
    except Exception as e:
        logger.exception("[ANALYTICS-STATS] Failed to load statistics")
        return web.json_response({"error": "Unable to load analytics"}, status=500)
@require_permission("view_analytics")
async def api_global_search(request: web.Request) -> web.Response:
    """GET /api/v1/analytics/search — Global search across incidents."""
    try:
        user = get_current_user_from_request(request)
        org_id = user["org_id"] if user and user["role"] != "SUPER_ADMIN" else None
        q = request.query.get("q", "").strip()
        decision = request.query.get("decision", "").strip().upper()
        try:
            risk_min = int(request.query.get("risk_min", "0"))
            limit = int(request.query.get("limit", "50"))
        except ValueError:
            return web.json_response({"error": "risk_min and limit must be integers"}, status=400)
        if len(q) > 256 or decision not in ("", "ALLOW", "WARN", "BLOCK"):
            return web.json_response({"error": "Invalid search query or decision"}, status=400)
        if not 0 <= risk_min <= 100 or not 1 <= limit <= 100:
            return web.json_response({"error": "risk_min must be 0-100 and limit must be 1-100"}, status=400)
        incidents = search_incidents(query_str=q, org_id=org_id, decision=decision, risk_min=risk_min, limit=limit)
        data = [
            {
                "id": inc.id,
                "timestamp": inc.timestamp.isoformat() if inc.timestamp else None,
                "user_ip": inc.user_ip,
                "target_host": inc.target_host,
                "risk_score": inc.risk_score,
                "decision": inc.decision,
                "intent_label": inc.intent_label,
            }
            for inc in incidents
        ]
        return web.json_response(data)
    except Exception:
        logger.exception("[ANALYTICS-SEARCH] Failed to search incidents")
        return web.json_response({"error": "Unable to search incidents"}, status=500)


@require_permission("view_analytics")
async def api_get_endpoint_stats(request: web.Request) -> web.Response:
    """GET /api/v1/analytics/endpoints-stats — persisted counts by destination."""
    try:
        user = get_current_user_from_request(request)
        org_id = user["org_id"] if user and user["role"] != "SUPER_ADMIN" else None
        return web.json_response(get_endpoint_incident_stats(org_id=org_id))
    except Exception:
        logger.exception("[ANALYTICS-ENDPOINTS] Failed to load endpoint statistics")
        return web.json_response({"error": "Unable to load endpoint analytics"}, status=500)
@require_permission("view_analytics")
async def api_get_compliance(request: web.Request) -> web.Response:
    """GET /api/v1/analytics/compliance — DPDP/GDPR/HIPAA compliance stats."""
    try:
        user = get_current_user_from_request(request)
        org_id = user["org_id"] if user and user["role"] != "SUPER_ADMIN" else None
        stats = get_weekly_compliance_stats(org_id=org_id)
        return web.json_response(stats)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)
@require_permission("export_reports")
async def api_get_compliance_pdf(request: web.Request) -> web.Response:
    """GET /api/v1/analytics/compliance/pdf — Download DPDP compliance PDF."""
    try:
        user = get_current_user_from_request(request)
        org_id = user["org_id"] if user and user["role"] != "SUPER_ADMIN" else None
        stats = get_weekly_compliance_stats(org_id=org_id)

        from reports.pdf_builder import CompliancePDFBuilder
        builder = CompliancePDFBuilder()
        pdf_bytes = builder.build_compliance_report(stats)

        return web.Response(
            body=pdf_bytes,
            content_type="application/pdf",
            headers={"Content-Disposition": 'attachment; filename="dpdp_compliance_report.pdf"'},
        )
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)
@require_permission("export_reports")
async def api_export_incidents_csv(request: web.Request) -> web.Response:
    """GET /api/v1/analytics/export — Export incidents to CSV format."""
    try:
        user = get_current_user_from_request(request)
        org_id = user["org_id"] if user and user["role"] != "SUPER_ADMIN" else None
        incidents = get_recent_incidents(limit=1000, org_id=org_id)
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Incident ID", "Timestamp", "User IP", "Target Host", "Risk Score", "Decision", "Intent", "Code Detected"])
        for inc in incidents:
            writer.writerow([
                inc.id,
                inc.timestamp.isoformat() if inc.timestamp else "",
                inc.user_ip,
                inc.target_host,
                inc.risk_score,
                inc.decision,
                inc.intent_label,
                inc.code_detected,
            ])
        return web.Response(
            text=output.getvalue(),
            content_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="incidents_export.csv"'},
        )
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)
