"""Logger node for the LangGraph pipeline.

Fifth and final node. Persists the incident to SQLite via SQLAlchemy
and broadcasts the event via Redis for real-time dashboard updates.
"""

import json
import logging
import os

from agents.state import AgentState

logger = logging.getLogger(__name__)


def _broadcast_event(state: AgentState) -> None:
    """Broadcast incident event via Redis pub/sub for dashboard updates."""
    try:
        import redis

        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        r = redis.from_url(redis_url, socket_timeout=0.2, socket_connect_timeout=0.2)

        event = {
            "incident_id": state.get("incident_id", ""),
            "risk_score": state.get("risk_score", 0),
            "decision": state.get("decision", "ALLOW"),
            "target_host": state.get("target_host", ""),
            "user_ip": state.get("user_ip", ""),
            "intent_label": state.get("intent_label", ""),
            "code_detected": state.get("code_detected", False),
            "entities_count": len(state.get("entities_found", [])),
        }

        r.publish("netrika:incidents", json.dumps(event))
        logger.info(f"[LOGGER] Broadcast event for incident {state.get('incident_id', '')}")
    except Exception as e:
        logger.warning(f"[LOGGER] Redis broadcast failed: {e}")


def logger_node(state: AgentState) -> AgentState:
    """Persist incident to database and broadcast for dashboard.

    This node:
    1. Creates an Incident record in SQLite via SQLAlchemy
    2. Creates EntityDetection records for each detected entity
    3. Broadcasts the event via Redis pub/sub for dashboard updates

    Args:
        state: Final agent state with all analysis results.

    Returns:
        State unchanged (terminal node).
    """
    incident_id = state.get("incident_id", "unknown")

    logger.info(
        f"[LOGGER] Persisting incident {incident_id}: "
        f"decision={state.get('decision')}, score={state.get('risk_score')}"
    )

    # ── 1. Persist Incident ────────────────────────────────────────
    try:
        from db.crud import create_incident, create_entity_detection
        from db.session import ensure_data_dir, init_database

        ensure_data_dir()
        init_database()

        # Build entities JSON (types + counts only, no values)
        entities = state.get("entities_found", [])
        entity_summary: dict[str, int] = {}
        for ent in entities:
            etype = ent.get("type", "UNKNOWN")
            count = ent.get("count", 1)
            entity_summary[etype] = entity_summary.get(etype, 0) + count

        create_incident(
            incident_id=incident_id,
            user_ip=state.get("user_ip", "unknown"),
            target_host=state.get("target_host", "unknown"),
            target_url=state.get("target_url", ""),
            http_method=state.get("http_method", "POST"),
            payload_hash=state.get("payload_hash", ""),
            payload_preview=state.get("payload_preview", ""),
            payload_size_bytes=state.get("payload_size_bytes", 0),
            risk_score=state.get("risk_score", 0),
            decision=state.get("decision", "ALLOW"),
            intent_label=state.get("intent_label", "SAFE"),
            entities_json=json.dumps(entity_summary),
            code_detected=state.get("code_detected", False),
            simulation_html=state.get("simulation_html", ""),
        )

        # ── 2. Persist Entity Detections ───────────────────────────
        for ent in entities:
            source = ent.get("source", "REGEX")
            create_entity_detection(
                incident_id=incident_id,
                entity_type=ent.get("type", "UNKNOWN"),
                entity_count=ent.get("count", 1),
                confidence_score=ent.get("score", 0.0),
                detector_source=source,
            )

        # NER entities logged for dashboard audit only — never used for block decisions
        for ent in state.get("audit_ner_entities", []):
            create_entity_detection(
                incident_id=incident_id,
                entity_type=ent.get("type", "UNKNOWN"),
                entity_count=ent.get("count", 1),
                confidence_score=ent.get("score", 0.0),
                detector_source="NER",
            )

        logger.info(f"[LOGGER] Incident {incident_id} persisted to database")

    except Exception as e:
        logger.error(f"[LOGGER] Database persistence failed for {incident_id}: {e}")

    # ── 3. Broadcast Event ─────────────────────────────────────────
    _broadcast_event(state)

    # ── 4. Email Alert ─────────────────────────────────────────────
    try:
        from db.crud import get_policy_value
        enable_alerts = get_policy_value("enable_email_alerts", "false").lower() == "true"
        
        if enable_alerts and state.get("decision") in ("BLOCK", "WARN"):
            from utils.mailer import EmailService
            EmailService.send_incident_alert(state)
    except Exception as e:
        logger.warning(f"[LOGGER] Email alert failed: {e}")

    return state
