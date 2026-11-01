"""Decision node for the LangGraph pipeline.

Third node. Applies risk thresholds to determine the decision:
ALLOW, WARN, or BLOCK.
"""

import json
import logging
import os

from agents.state import AgentState

logger = logging.getLogger(__name__)


def _load_thresholds() -> tuple[int, int]:
    """Load BLOCK and WARN thresholds from config."""
    try:
        config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "config.json")
        with open(config_path, "r") as f:
            config = json.load(f)
        return config.get("block_threshold", 70), config.get("warn_threshold", 30)
    except (FileNotFoundError, json.JSONDecodeError):
        return 70, 30


def decision_node(state: AgentState) -> AgentState:
    """Apply risk thresholds to determine ALLOW / WARN / BLOCK."""
    risk_score = state.get("risk_score", 0)
    incident_id = state.get("incident_id", "unknown")
    user_ip = state.get("user_ip", "")

    # Browser extension / file uploads: BLOCK immediately if policy entities were found
    is_extension = (
        user_ip.startswith("browser-extension")
        or user_ip.startswith("extension")
        or user_ip == "chat-upload"
    )
    policy_entities = state.get("entities_found") or []
    if is_extension and policy_entities:
        state["decision"] = "BLOCK"
        state["risk_score"] = max(int(risk_score or 0), 85)
        logger.info(
            f"[DECISION] 🛑 Incident {incident_id}: extension policy BLOCK — "
            f"{len(policy_entities)} sensitive entity type(s)"
        )
        return state

    # The layered scanner has the last word on what must not leave: its BLOCK is final.
    scanner_action = state.get("scanner_action", "ALLOW")
    if scanner_action == "BLOCK":
        state["decision"] = "BLOCK"
        state["risk_score"] = max(int(risk_score or 0), 85)
        logger.info(f"[DECISION] Incident {incident_id}: scanner BLOCK")
        return state

    block_threshold, warn_threshold = _load_thresholds()

    if risk_score >= block_threshold:
        decision = "BLOCK"
    elif risk_score >= warn_threshold:
        decision = "WARN"
    else:
        decision = "ALLOW"

    if decision == "ALLOW" and scanner_action in ("WARN", "TOKENIZE", "REDACT"):
        decision = "WARN"

    state["decision"] = decision

    emoji = {"BLOCK": "🛑", "WARN": "⚠️", "ALLOW": "✅"}.get(decision, "❓")
    logger.info(
        f"[DECISION] {emoji} Incident {incident_id}: "
        f"score={risk_score} → {decision} "
        f"(thresholds: BLOCK≥{block_threshold}, WARN≥{warn_threshold})"
    )

    return state


def should_intervene(state: AgentState) -> str:
    """Conditional edge function for LangGraph routing.

    Determines whether to route to intervention_node or logger_node.

    Returns:
        "intervention_node" if decision is WARN or BLOCK,
        "logger_node" if ALLOW.
    """
    # Fast path for chat uploads & browser extension scans: skip Ollama breach simulation (major latency win).
    user_ip = state.get("user_ip", "")
    if user_ip == "chat-upload" or user_ip.startswith("extension") or user_ip.startswith("browser-extension"):
        return "logger_node"

    decision = state.get("decision", "ALLOW")
    if decision in ("WARN", "BLOCK"):
        return "intervention_node"
    return "logger_node"
