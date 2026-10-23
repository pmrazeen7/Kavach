"""Intervention node for the LangGraph pipeline.

Fourth node (conditional). Generates a breach simulation using
local Phi-3 via Ollama and builds the red-screen HTML page.
"""

import json
import logging
import os

from agents.state import AgentState

logger = logging.getLogger(__name__)


def _build_entity_summary(entities: list[dict]) -> str:
    """Build a sanitized entity summary for the Phi-3 prompt.

    IMPORTANT: Never includes actual values — only types and counts.
    """
    type_counts: dict[str, int] = {}
    for ent in entities:
        etype = ent.get("type", "UNKNOWN")
        count = ent.get("count", 1)
        type_counts[etype] = type_counts.get(etype, 0) + count

    if not type_counts:
        return "No specific entities detected."

    parts = [f"{count}x {etype}" for etype, count in type_counts.items()]
    return ", ".join(parts)


def _build_sanitized_payload_summary(state: AgentState) -> str:
    """Build a sanitized payload summary for the Phi-3 prompt.

    This summarizes the TYPE of data found, NOT the actual data.
    """
    parts = []
    if state.get("code_detected"):
        parts.append("source code")
    if state.get("secrets_detected"):
        parts.append("API keys or credentials")

    pii_types = set()
    for ent in state.get("entities_found", []):
        etype = ent.get("type", "")
        if etype in ("AADHAAR", "PAN", "CREDIT_CARD", "PHONE_NUMBER", "EMAIL_ADDRESS"):
            pii_types.add(etype.lower().replace("_", " "))

    if pii_types:
        parts.append(f"PII data ({', '.join(pii_types)})")

    if not parts:
        parts.append("potentially sensitive data")

    return f"A payload containing {', '.join(parts)}"


def _generate_breach_simulation(state: AgentState) -> str:
    """Generate a breach simulation story using Ollama Phi-3.

    If Ollama is unavailable, returns a fallback static simulation.
    The actual payload is NEVER sent to Phi-3 — only sanitized summaries.
    """
    entity_summary = _build_entity_summary(state.get("entities_found", []))
    payload_summary = _build_sanitized_payload_summary(state)

    prompt = (
        "You are a cybersecurity educator. A user was about to send the "
        f"following data to an AI chatbot: {payload_summary}. "
        f"The following sensitive items were detected: {entity_summary}. "
        "Write a 3-paragraph realistic story of how a malicious actor "
        "could exploit this specific leaked data. Be concrete. "
        "Name the attack type. Describe the damage. "
        "End with one sentence of advice. Maximum 200 words."
    )

    ollama_host = os.getenv("OLLAMA_HOST", "http://localhost:11434")
    ollama_model = os.getenv("OLLAMA_MODEL", "phi3:mini")

    try:
        import ollama as ollama_sdk

        client = ollama_sdk.Client(host=ollama_host)
        response = client.chat(
            model=ollama_model,
            messages=[{"role": "user", "content": prompt}],
            options={"temperature": 0.7, "num_predict": 300},
        )
        simulation_text = response["message"]["content"]
        logger.info(f"[INTERVENTION] Phi-3 breach simulation generated ({len(simulation_text)} chars)")
        return simulation_text

    except Exception as e:
        logger.warning(f"[INTERVENTION] Ollama unavailable ({e}), using fallback simulation")
        return _fallback_simulation(entity_summary, payload_summary)


def _fallback_simulation(entity_summary: str, payload_summary: str) -> str:
    """Generate a static fallback breach simulation when Ollama is unavailable."""
    return (
        f"BREACH SCENARIO: {payload_summary} was intercepted before reaching "
        f"an external AI service. Detected sensitive items: {entity_summary}.\n\n"
        "If this data had been transmitted, a threat actor monitoring AI service "
        "traffic could have captured it through a man-in-the-middle attack or "
        "via the AI provider's data retention policies. The exposed information "
        "could be used for identity theft, financial fraud, or corporate espionage "
        "depending on the data type.\n\n"
        "In a real-world scenario, leaked credentials enable unauthorized access "
        "to internal systems, PII enables phishing and social engineering attacks, "
        "and source code reveals proprietary algorithms and security vulnerabilities. "
        "The damage can range from regulatory fines under DPDP Act 2023 to complete "
        "compromise of corporate infrastructure.\n\n"
        "ADVICE: Always sanitize data before sharing with external AI tools and use "
        "approved data handling procedures as defined by your organization's security policy."
    )


def _build_intervention_html(state: AgentState) -> str:
    """Build the red-screen intervention HTML from the Jinja2 template."""
    try:
        from simulation.page_builder import InterventionPageBuilder
        builder = InterventionPageBuilder()
        return builder.render_blocked_page(
            incident_id=state.get("incident_id", "unknown"),
            risk_score=state.get("risk_score", 0),
            entities=state.get("entities_found", []),
            simulation_text=state.get("simulation_html", ""),
            decision=state.get("decision", "BLOCK"),
        )
    except Exception as e:
        logger.error(f"[INTERVENTION] Failed to render HTML: {e}")
        return f"<html><body><h1>ACCESS BLOCKED</h1><p>Incident: {state.get('incident_id', 'unknown')}</p></body></html>"


def intervention_node(state: AgentState) -> AgentState:
    """Generate breach simulation and build intervention page.

    This node:
    1. Calls Phi-3 via Ollama to generate a breach simulation story
       (using SANITIZED data only — never raw payload)
    2. Renders the red-screen HTML intervention page
    3. Stores the simulation HTML in state for logging

    Args:
        state: Current agent state with decision WARN or BLOCK.

    Returns:
        Updated state with simulation_html populated.
    """
    incident_id = state.get("incident_id", "unknown")
    decision = state.get("decision", "BLOCK")

    logger.info(f"[INTERVENTION] Generating simulation for incident {incident_id} ({decision})")

    # Check if breach simulation is enabled in config
    enable_simulation = True
    try:
        config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "config.json")
        with open(config_path, "r") as f:
            config = json.load(f)
        enable_simulation = config.get("enable_breach_simulation", True)
    except (FileNotFoundError, json.JSONDecodeError):
        pass

    # Generate breach simulation
    if enable_simulation:
        simulation_text = _generate_breach_simulation(state)
    else:
        simulation_text = "Breach simulation is disabled in policy configuration."

    state["simulation_html"] = simulation_text

    # Build the intervention HTML page
    html_content = _build_intervention_html(state)

    # Store HTML in a temporary location for the intervention server
    try:
        os.makedirs("data/incidents", exist_ok=True)
        html_path = f"data/incidents/{incident_id}.html"
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(html_content)
        logger.info(f"[INTERVENTION] Saved intervention page to {html_path}")
    except Exception as e:
        logger.error(f"[INTERVENTION] Failed to save HTML: {e}")

    return state
