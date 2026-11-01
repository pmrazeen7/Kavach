"""Intervention page builder using Jinja2 templates.

Renders the red-screen blocked page and warning banner HTML
for intercepted requests.
"""

import logging
import os

from jinja2 import Environment, FileSystemLoader, select_autoescape

logger = logging.getLogger(__name__)

TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), "templates")


class InterventionPageBuilder:
    """Builds intervention HTML pages for BLOCK and WARN decisions.

    Uses Jinja2 templates for rendering:
    - blocked.html: Full-screen red intervention page
    - warning_banner.html: Injected banner for WARN decisions
    """

    def __init__(self, template_dir: str | None = None) -> None:
        """Initialize the page builder with the template directory."""
        tpl_dir = template_dir or TEMPLATE_DIR
        self.env = Environment(
            loader=FileSystemLoader(tpl_dir),
            autoescape=select_autoescape(["html"]),
        )
        logger.info(f"InterventionPageBuilder initialized with templates from {tpl_dir}")

    def render_blocked_page(
        self,
        incident_id: str,
        risk_score: int,
        entities: list[dict],
        simulation_text: str,
        decision: str = "BLOCK",
    ) -> str:
        """Render the red-screen blocked page.

        Args:
            incident_id: Unique incident UUID.
            risk_score: Computed risk score (0-100).
            entities: List of detected entities (types only, no values).
            simulation_text: AI-generated breach simulation story.
            decision: Decision type (BLOCK or WARN).

        Returns:
            Complete HTML string for the intervention page.
        """
        # Deduplicate entity types for display
        entity_types: dict[str, int] = {}
        for ent in entities:
            etype = ent.get("type", "UNKNOWN")
            count = ent.get("count", 1)
            entity_types[etype] = entity_types.get(etype, 0) + count

        # Determine gauge color
        if risk_score >= 70:
            gauge_color = "#ff2d55"
        elif risk_score >= 30:
            gauge_color = "#ffb020"
        else:
            gauge_color = "#00e87a"

        # Calculate SVG arc for the gauge
        circumference = 2 * 3.14159 * 40  # radius = 40
        offset = circumference * (1 - risk_score / 100)

        try:
            template = self.env.get_template("blocked.html")
            return template.render(
                incident_id=incident_id,
                risk_score=risk_score,
                entity_types=entity_types,
                simulation_text=simulation_text,
                decision=decision,
                gauge_color=gauge_color,
                circumference=round(circumference, 2),
                offset=round(offset, 2),
            )
        except Exception as e:
            logger.error(f"Failed to render blocked page template: {e}")
            return self._fallback_html(incident_id, risk_score, entity_types, simulation_text)

    def render_warning_banner(
        self,
        incident_id: str,
        risk_score: int,
        entities: list[dict],
    ) -> str:
        """Render the warning banner HTML for injection into responses.

        Args:
            incident_id: Unique incident UUID.
            risk_score: Computed risk score (0-100).
            entities: List of detected entities.

        Returns:
            HTML string for the warning banner.
        """
        entity_types = list({ent.get("type", "UNKNOWN") for ent in entities})

        try:
            template = self.env.get_template("warning_banner.html")
            return template.render(
                incident_id=incident_id,
                risk_score=risk_score,
                entity_types=entity_types,
            )
        except Exception as e:
            logger.error(f"Failed to render warning banner template: {e}")
            return (
                f'<div style="position:fixed;top:0;left:0;right:0;z-index:99999;'
                f'background:#ffb020;color:#000;padding:12px;text-align:center;'
                f'font-family:monospace;font-size:14px;">'
                f'⚠ NETRIKA-TRACE: Data leak risk detected (score: {risk_score}). '
                f'Incident ID: {incident_id}</div>'
            )

    def _fallback_html(
        self,
        incident_id: str,
        risk_score: int,
        entity_types: dict[str, int],
        simulation_text: str,
    ) -> str:
        """Generate fallback HTML when template rendering fails."""
        entities_html = "".join(
            f'<span style="display:inline-block;background:#ff2d5530;color:#ff2d55;'
            f'padding:4px 12px;border-radius:4px;margin:4px;font-family:monospace;">'
            f'{etype} ×{count}</span>'
            for etype, count in entity_types.items()
        )

        return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>ACCESS BLOCKED — Netrika-Trace</title>
<style>body{{background:#0a0a0a;color:#c8d8e8;font-family:'Courier New',monospace;
display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;}}
.card{{max-width:680px;border:1px solid #1a2535;border-top:4px solid #ff2d55;
padding:40px;background:#0b1017;}}</style></head>
<body><div class="card">
<h1 style="color:#ff2d55;font-size:32px;">⚠ ACCESS BLOCKED</h1>
<p>Data leak attempt intercepted by Netrika-Trace</p>
<p>Risk Score: <strong style="color:#ff2d55;font-size:24px;">{risk_score}</strong>/100</p>
<div>{entities_html}</div>
<div style="margin-top:20px;padding:16px;border-left:3px solid #ff2d55;background:#111820;">
<p style="color:#ff2d55;font-size:11px;letter-spacing:2px;">BREACH SIMULATION</p>
<p style="line-height:1.8;">{simulation_text}</p></div>
<p style="margin-top:24px;color:#4a6278;font-size:11px;">Incident: {incident_id}</p>
</div></body></html>"""
