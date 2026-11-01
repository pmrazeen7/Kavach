"""Payload extraction and normalization node.

First node in the LangGraph pipeline. Extracts the text payload
from the intercepted HTTP request, normalizes it, and prepares
it for downstream analysis.
"""

import hashlib
import logging
import uuid

from agents.state import AgentState

logger = logging.getLogger(__name__)


def sniffer_node(state: AgentState) -> AgentState:
    """Extract and normalize the intercepted payload.

    This node:
    1. Generates a unique incident UUID
    2. Computes SHA-256 hash of the payload
    3. Leaves prompt preview empty to avoid retaining sensitive text
    4. Normalizes the payload text (strip, decode)

    Args:
        state: Current agent state with raw payload data.

    Returns:
        Updated state with incident_id, payload_hash, payload_preview.
    """
    payload = state.get("payload", "")
    user_ip = state.get("user_ip", "unknown")
    target_host = state.get("target_host", "unknown")

    # Generate incident ID
    incident_id = str(uuid.uuid4())

    # Compute payload hash for deduplication
    payload_hash = hashlib.sha256(payload.encode("utf-8", errors="replace")).hexdigest()

    # Normalize payload: strip whitespace, limit to reasonable size
    normalized_payload = payload.strip()
    if len(normalized_payload) > 50000:
        normalized_payload = normalized_payload[:50000]
        logger.warning(
            f"Payload truncated from {len(payload)} to 50000 chars for incident {incident_id}"
        )

    payload_size = len(payload.encode("utf-8", errors="replace"))

    logger.info(
        f"[SNIFFER] Incident {incident_id}: "
        f"{payload_size} bytes from {user_ip} → {target_host}"
    )

    state["incident_id"] = incident_id
    state["payload"] = normalized_payload
    state["payload_hash"] = payload_hash
    state["payload_preview"] = ""
    state["payload_size_bytes"] = payload_size
    state["risk_score"] = 0
    state["pii_score"] = 0.0
    state["entity_score"] = 0.0
    state["semantic_score"] = 0.0
    state["entities_found"] = []
    state["intent_label"] = "SAFE"
    state["decision"] = "ALLOW"
    state["code_detected"] = False
    state["secrets_detected"] = False
    state["simulation_html"] = ""

    return state
