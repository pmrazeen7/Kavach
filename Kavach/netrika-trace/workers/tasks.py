"""Celery Background Async Worker Tasks."""

import logging
import urllib.request
import json
from workers.celery_app import celery_app
from database.crud import get_entity_detections_for_incident, get_incident_by_id

logger = logging.getLogger(__name__)


@celery_app.task(name="workers.tasks.generate_incident_pdf_task")
def generate_incident_pdf_task(incident_id: str) -> str:
    """Background task to generate an incident PDF report."""
    logger.info(f"[TASK] Starting background PDF generation for incident {incident_id}")
    incident = get_incident_by_id(incident_id)
    if not incident:
        return f"Error: Incident {incident_id} not found"

    detections = get_entity_detections_for_incident(incident_id)
    from reports.pdf_builder import IncidentPDFBuilder

    builder = IncidentPDFBuilder()
    pdf_bytes = builder.build_incident_report(incident, detections)
    logger.info(f"[TASK] Completed PDF generation ({len(pdf_bytes)} bytes) for {incident_id}")
    return f"Success: PDF generated for {incident_id}"


@celery_app.task(name="workers.tasks.dispatch_webhook_alert_task")
def dispatch_webhook_alert_task(incident_id: str, webhook_url: str) -> str:
    """Background task to send Slack/Teams webhook alert for high-risk incidents."""
    logger.info(f"[TASK] Dispatching webhook alert for incident {incident_id} to {webhook_url}")
    incident = get_incident_by_id(incident_id)
    if not incident:
        return f"Error: Incident {incident_id} not found"

    payload = {
        "text": f"🚨 *NETRIKA-TRACE SECURITY ALERT*\n"
                f"*Incident ID*: `{incident.id}`\n"
                f"*Decision*: `{incident.decision}`\n"
                f"*Risk Score*: `{incident.risk_score}/100`\n"
                f"*Target Host*: `{incident.target_host}`",
    }

    try:
        req = urllib.request.Request(
            webhook_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            status = response.getcode()
            return f"Success: Webhook sent (HTTP {status})"
    except Exception as e:
        logger.error(f"[TASK] Webhook dispatch failed: {e}")
        return f"Failed: {e}"
