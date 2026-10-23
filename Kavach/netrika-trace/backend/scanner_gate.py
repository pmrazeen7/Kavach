"""Server-side enforcement for the chat API.

The UI scanner is only a helper: this middleware scans every chat message on the
server, so a direct API call cannot skip it. A BLOCK never reaches the model; a
REDACT/TOKENIZE is rewritten before it does. Only metadata is logged or stored.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import uuid
from datetime import datetime, timezone

from aiohttp import web

from backend.auth.rbac import get_current_user_from_request
from scanner import service

logger = logging.getLogger(__name__)

GATED_POST = "/api/chat"


def _record_block(request: web.Request, message: str, result) -> str:
    """Create an incident row (hash + metadata only) for a message stopped at the gate."""
    from database.crud import create_incident

    incident_id = str(uuid.uuid4())
    entities = {e["type"]: e["count"] for e in service.to_entities(result)}
    user = request.get("user") or {}
    try:
        create_incident(
            incident_id=incident_id,
            user_ip="chat-ui",
            target_host="gemini.google.com",
            target_url="https://generativelanguage.googleapis.com/v1/chat",
            http_method="POST",
            payload_hash=hashlib.sha256(message.encode("utf-8", errors="replace")).hexdigest(),
            payload_preview="",
            payload_size_bytes=len(message.encode("utf-8", errors="replace")),
            risk_score=max(result.score, 85),
            decision="BLOCK",
            intent_label="SECRET_LEAK",
            entities_json=json.dumps(entities),
            code_detected=False,
            org_id=user.get("org_id"),
            user_id=user.get("sub") or user.get("user_id"),
        )
    except Exception:
        logger.exception("[SCANNER-GATE] could not record blocked incident")
    return incident_id


async def _broadcast(event: dict) -> None:
    try:
        from server.intervention_server import broadcast_to_websockets

        await broadcast_to_websockets(event)
    except Exception:
        logger.debug("broadcast unavailable", exc_info=True)


@web.middleware
async def scanner_gate(request: web.Request, handler):
    path = request.path
    if request.method == "OPTIONS" or not path.startswith("/api/chat"):
        return await handler(request)

    # Every chat endpoint needs a signed-in user (they used to be open).
    user = get_current_user_from_request(request)
    if not user:
        return web.json_response({"error": "Unauthorized: sign in to use the chat sandbox"}, status=401)
    request["user"] = user

    if not (request.method == "POST" and path == GATED_POST):
        return await handler(request)

    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "Invalid JSON"}, status=400)
    message = body.get("message", "")
    if not isinstance(message, str) or not message.strip():
        return await handler(request)

    session_id = body.get("session_id", "")
    history: list[str] = []
    if session_id:
        from agents.llm_service import get_session_history

        history = [m["content"] for m in get_session_history(session_id) if m.get("role") == "user"][-6:]

    confirmed = [c for c in body.get("confirmed_safe", []) if isinstance(c, str)][:100]
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(None, lambda: service.scan_text(message, history=history, confirmed=confirmed, deep=False))

    if result.action == "BLOCK":
        incident_id = _record_block(request, message, result)
        await _broadcast({
            "id": incident_id, "decision": "BLOCK", "risk_score": max(result.score, 85), "user_ip": "chat-ui", "target_host": "gemini.google.com",
            "http_method": "POST", "intent_label": "SECRET_LEAK", "entities_json": json.dumps({e["type"]: e["count"] for e in service.to_entities(result)}),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        return web.json_response(
            {
                "error": "blocked_by_policy",
                "blocked": True,
                "incident_id": incident_id,
                "scan": result.to_dict(),
                "message": "This message contains data that policy does not allow to leave. It was not sent to the AI model.",
            },
            status=422,
        )

    request["scan"] = result
    if result.action in ("REDACT", "TOKENIZE"):
        request["scan_message"] = service.sanitize(message, result)
    return await handler(request)
