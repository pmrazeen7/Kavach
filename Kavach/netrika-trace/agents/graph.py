"""LangGraph StateGraph definition for the Netrika-Trace pipeline.

Defines the multi-agent state machine with typed nodes:
  sniffer_node → forensic_node → decision_node →
  intervention_node (conditional) → logger_node

Uses LangGraph StateGraph with conditional edges based on
the decision node's risk threshold routing.
"""

import logging

from langgraph.graph import StateGraph, END

from agents.state import AgentState
from agents.sniffer_node import sniffer_node
from agents.forensic_node import forensic_node
from agents.decision_node import decision_node, should_intervene
from agents.intervention_node import intervention_node
from agents.logger_node import logger_node

logger = logging.getLogger(__name__)


def build_graph() -> StateGraph:
    """Build and compile the LangGraph StateGraph for the DLP pipeline.

    Graph topology:
        sniffer_node
            ↓
        forensic_node
            ↓
        decision_node
            ↓ (conditional)
        ┌─────────────────────┐
        │ WARN/BLOCK          │ ALLOW
        ↓                     ↓
        intervention_node     logger_node
            ↓                     ↓
        logger_node              END
            ↓
           END

    Returns:
        Compiled LangGraph StateGraph ready for invocation.
    """
    # Create the state graph with our typed state
    graph = StateGraph(AgentState)

    # Add all nodes
    graph.add_node("sniffer_node", sniffer_node)
    graph.add_node("forensic_node", forensic_node)
    graph.add_node("decision_node", decision_node)
    graph.add_node("intervention_node", intervention_node)
    graph.add_node("logger_node", logger_node)

    # Set the entry point
    graph.set_entry_point("sniffer_node")

    # Add edges: sniffer → forensic → decision
    graph.add_edge("sniffer_node", "forensic_node")
    graph.add_edge("forensic_node", "decision_node")

    # Conditional edge from decision_node
    graph.add_conditional_edges(
        "decision_node",
        should_intervene,
        {
            "intervention_node": "intervention_node",
            "logger_node": "logger_node",
        },
    )

    # intervention → logger → END
    graph.add_edge("intervention_node", "logger_node")
    graph.add_edge("logger_node", END)

    logger.info("[GRAPH] LangGraph pipeline compiled successfully")

    return graph.compile()


# Lazy pipeline singleton
_dlp_pipeline = None


def _get_pipeline():
    global _dlp_pipeline
    if _dlp_pipeline is None:
        _dlp_pipeline = build_graph()
    return _dlp_pipeline


def run_pipeline(
    payload: str,
    user_ip: str = "unknown",
    target_host: str = "unknown",
    target_url: str = "",
    http_method: str = "POST",
    history: list | None = None,
) -> AgentState:
    """Run the full DLP pipeline on an intercepted payload.

    This is the main entry point called by the mitmproxy addon.

    Args:
        payload: The intercepted text payload.
        user_ip: Source IP address of the request.
        target_host: Target hostname (e.g., api.openai.com).
        target_url: Full target URL.
        http_method: HTTP method (GET, POST, etc.).

    Returns:
        Final AgentState with all analysis results and decision.
    """
    initial_state: AgentState = {
        "payload": payload,
        "user_ip": user_ip,
        "target_host": target_host,
        "target_url": target_url,
        "http_method": http_method,
        "payload_size_bytes": len(payload.encode("utf-8", errors="replace")),
        "risk_score": 0,
        "pii_score": 0.0,
        "entity_score": 0.0,
        "semantic_score": 0.0,
        "entities_found": [],
        "intent_label": "SAFE",
        "decision": "ALLOW",
        "code_detected": False,
        "secrets_detected": False,
        "scan_history": list(history or []),
        "scanner_action": "ALLOW",
        "scanner_summary": {},
        "simulation_html": "",
        "incident_id": "",
        "payload_hash": "",
        "payload_preview": "",
    }

    logger.info(
        f"[PIPELINE] Starting DLP analysis: {user_ip} → {target_host} "
        f"({len(payload)} chars)"
    )

    result = _get_pipeline().invoke(initial_state)

    logger.info(
        f"[PIPELINE] Complete: incident={result.get('incident_id')} "
        f"score={result.get('risk_score')} decision={result.get('decision')}"
    )

    return result
