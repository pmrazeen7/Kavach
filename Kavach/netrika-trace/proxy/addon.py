"""Mitmproxy async addon for intercepting AI-bound requests.

Core interceptor of the Netrika-Trace system. Sits as a transparent
proxy between the corporate LAN and the internet, intercepting
requests to AI services and running the LangGraph DLP pipeline.
"""

import asyncio
import json
import logging
import os

import mitmproxy.http
from mitmproxy import ctx

from proxy.ai_endpoints import AIEndpointRegistry

logger = logging.getLogger(__name__)


class NetrikaTraceAddon:
    """Mitmproxy async addon that intercepts AI-bound requests.

    For each intercepted request:
    1. Checks if the target host is a monitored AI endpoint
    2. Extracts the POST body (JSON or form data)
    3. Runs the LangGraph DLP pipeline
    4. Based on the decision:
       - BLOCK: Redirects to the red-screen intervention page
       - WARN: Injects a warning banner into the response
       - ALLOW: Passes the request through unchanged
    """

    def __init__(self) -> None:
        """Initialize the addon with the endpoint registry."""
        self.registry = AIEndpointRegistry()
        self._pipeline = None
        logger.info("[ADDON] Netrika-Trace mitmproxy addon initialized")

    def _get_pipeline(self):
        """Lazy-load the LangGraph pipeline to avoid import-time model loading."""
        if self._pipeline is None:
            from agents.graph import run_pipeline
            self._pipeline = run_pipeline
        return self._pipeline

    def _extract_payload(self, flow: mitmproxy.http.HTTPFlow) -> str:
        """Extract text payload from the HTTP request.

        Handles JSON bodies, form data, and raw text.

        Args:
            flow: The mitmproxy HTTP flow.

        Returns:
            Extracted text payload or empty string.
        """
        if flow.request.content is None:
            return ""

        try:
            raw = flow.request.content.decode("utf-8", errors="replace")
        except Exception:
            return ""

        content_type = flow.request.headers.get("content-type", "").lower()

        # JSON body — extract text fields
        if "application/json" in content_type:
            try:
                data = json.loads(raw)
                return self._extract_text_from_json(data)
            except json.JSONDecodeError:
                return raw

        # Multipart form data — extract text parts
        if "multipart/form-data" in content_type:
            return raw

        # URL-encoded form data
        if "application/x-www-form-urlencoded" in content_type:
            return raw

        # Plain text or other
        return raw

    def _extract_text_from_json(self, data, depth: int = 0) -> str:
        """Recursively extract text content from JSON structures.

        Specifically targets common AI API payload structures:
        - OpenAI: messages[].content
        - Anthropic: messages[].content
        - Generic: prompt, text, query, input fields

        Args:
            data: Parsed JSON data.
            depth: Current recursion depth (max 10).

        Returns:
            Concatenated text content.
        """
        if depth > 10:
            return ""

        parts: list[str] = []

        if isinstance(data, str):
            return data

        if isinstance(data, list):
            for item in data:
                parts.append(self._extract_text_from_json(item, depth + 1))
            return "\n".join(p for p in parts if p)

        if isinstance(data, dict):
            # Common AI API text fields
            text_keys = {
                "content", "text", "prompt", "query", "input",
                "message", "question", "instruction", "system",
                "user", "assistant",
            }
            for key in text_keys:
                if key in data and isinstance(data[key], str):
                    parts.append(data[key])

            # Recurse into nested structures
            for key, value in data.items():
                if isinstance(value, (dict, list)):
                    parts.append(self._extract_text_from_json(value, depth + 1))

        return "\n".join(p for p in parts if p)

    async def request(self, flow: mitmproxy.http.HTTPFlow) -> None:
        """Async request handler — intercepts AI-bound requests.

        Called by mitmproxy for every HTTP request passing through the proxy.
        Only processes requests to monitored AI endpoints.
        """
        hostname = flow.request.host
        if not self.registry.is_ai_endpoint(hostname):
            return
        flow.metadata["netrika_ai_request"] = True  # its reply is scanned too

        # Only intercept POST requests (the ones carrying data)
        if flow.request.method.upper() != "POST":
            return

        payload = self._extract_payload(flow)
        if not payload or len(payload.strip()) < 10:
            return

        user_ip = flow.client_conn.address[0] if flow.client_conn.address else "unknown"
        target_url = flow.request.pretty_url

        logger.info(
            f"[ADDON] Intercepted: {user_ip} → {hostname} "
            f"({len(payload)} chars)"
        )

        # Run the LangGraph DLP pipeline
        try:
            run_pipeline = self._get_pipeline()
            result = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: run_pipeline(
                    payload=payload,
                    user_ip=user_ip,
                    target_host=hostname,
                    target_url=target_url,
                    http_method=flow.request.method,
                ),
            )

            decision = result.get("decision", "ALLOW")
            incident_id = result.get("incident_id", "unknown")
            risk_score = result.get("risk_score", 0)

            logger.info(
                f"[ADDON] Decision for {incident_id}: "
                f"{decision} (score: {risk_score})"
            )

            if decision == "BLOCK":
                # Redirect to intervention page
                flow.response = mitmproxy.http.Response.make(
                    302,
                    b"",
                    {
                        "Location": f"http://netrika-trace.internal/incident/{incident_id}",
                        "X-Netrika-Decision": "BLOCK",
                        "X-Netrika-Incident": incident_id,
                        "X-Netrika-Score": str(risk_score),
                    },
                )
                logger.info(f"[ADDON] BLOCKED request — redirecting to intervention page")

            elif decision == "WARN":
                # Store warning info in flow metadata for response handler
                flow.metadata["netrika_warn"] = True
                flow.metadata["netrika_incident_id"] = incident_id
                flow.metadata["netrika_risk_score"] = risk_score
                flow.metadata["netrika_entities"] = result.get("entities_found", [])

        except Exception as e:
            logger.error(f"[ADDON] Pipeline error: {e}", exc_info=True)
            # Default: let the request through if the pipeline itself crashes (the scanner layer fails closed on its own).
            # Set PROXY_FAIL_CLOSED=1 to stop AI-bound traffic instead whenever analysis cannot run.
            if os.getenv("PROXY_FAIL_CLOSED") == "1":
                flow.response = mitmproxy.http.Response.make(503, b"Netrika-Trace could not inspect this request, so it was not sent.", {"X-Netrika-Decision": "BLOCK"})

    @staticmethod
    def _mask_model_output(flow: mitmproxy.http.HTTPFlow) -> None:
        """Scan the AI service's reply and mask sensitive data it echoes or invents.

        Only complete (non-streamed) text/JSON bodies are inspected; a streamed reply is
        passed through untouched, which is a known limitation.
        """
        resp = flow.response
        if resp is None or resp.content is None or len(resp.content) > 2_000_000:
            return
        ctype = resp.headers.get("content-type", "").lower()
        if not any(t in ctype for t in ("json", "text/plain", "text/markdown")) or "event-stream" in ctype:
            return
        try:
            from scanner import service
            from scanner.redact import apply as apply_redaction

            body = resp.content.decode("utf-8", errors="replace")
            result = service.scan_text(body, deep=False)
            if not service.get_store().settings().scan_output:
                return
            flagged = [f for f in result.findings if f.action in ("BLOCK", "REDACT", "TOKENIZE")]
            if flagged:
                masked, _ = apply_redaction(body, flagged, mode="mask")
                resp.content = masked.encode("utf-8")
                flow.metadata["netrika_output_masked"] = len(flagged)
                logger.info(f"[ADDON] Masked {len(flagged)} sensitive item(s) in the model reply")
        except Exception as e:  # never break the response path
            logger.error(f"[ADDON] Output scan failed: {e}")

    async def response(self, flow: mitmproxy.http.HTTPFlow) -> None:
        """Async response handler: masks sensitive data in AI replies and injects the WARN banner."""
        if flow.metadata.get("netrika_ai_request"):
            self._mask_model_output(flow)
        if not flow.metadata.get("netrika_warn"):
            return

        if flow.response is None or flow.response.content is None:
            return

        content_type = flow.response.headers.get("content-type", "").lower()
        if "text/html" not in content_type:
            return

        try:
            from simulation.page_builder import InterventionPageBuilder
            builder = InterventionPageBuilder()
            banner_html = builder.render_warning_banner(
                incident_id=flow.metadata.get("netrika_incident_id", ""),
                risk_score=flow.metadata.get("netrika_risk_score", 0),
                entities=flow.metadata.get("netrika_entities", []),
            )

            html = flow.response.content.decode("utf-8", errors="replace")

            # Inject banner after <body> tag
            if "<body" in html.lower():
                import re
                html = re.sub(
                    r"(<body[^>]*>)",
                    r"\1" + banner_html,
                    html,
                    count=1,
                    flags=re.IGNORECASE,
                )
                flow.response.content = html.encode("utf-8")
                logger.info("[ADDON] Injected warning banner into response")

        except Exception as e:
            logger.error(f"[ADDON] Banner injection failed: {e}")


# Addon instance for mitmproxy
addons = [NetrikaTraceAddon()]
