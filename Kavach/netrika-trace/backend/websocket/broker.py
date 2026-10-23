"""Real-Time WebSocket Event Broker for SOC Dashboard & Extension Policy Sync."""

import json
import logging
import aiohttp
from aiohttp import web

logger = logging.getLogger(__name__)

# Active WebSocket Connection Pools
ws_feed_clients: set[web.WebSocketResponse] = set()
ws_policy_clients: set[web.WebSocketResponse] = set()


async def websocket_feed_handler(request: web.Request) -> web.WebSocketResponse:
    """WebSocket endpoint for live SOC dashboard ticker updates (/ws/live-feed & /ws/alerts)."""
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    ws_feed_clients.add(ws)
    logger.info(f"[WS-FEED] Client connected ({len(ws_feed_clients)} total active SOC connections)")

    try:
        async for msg in ws:
            if msg.type == aiohttp.WSMsgType.TEXT:
                pass
            elif msg.type in (aiohttp.WSMsgType.ERROR, aiohttp.WSMsgType.CLOSE):
                break
    finally:
        ws_feed_clients.discard(ws)
        logger.info(f"[WS-FEED] Client disconnected ({len(ws_feed_clients)} remaining)")

    return ws


async def websocket_policy_handler(request: web.Request) -> web.WebSocketResponse:
    """WebSocket endpoint for live extension policy auto-push (/ws/policy-sync)."""
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    ws_policy_clients.add(ws)
    logger.info(f"[WS-POLICY] Extension client connected ({len(ws_policy_clients)} total active extension connections)")

    try:
        async for msg in ws:
            if msg.type == aiohttp.WSMsgType.TEXT:
                pass
            elif msg.type in (aiohttp.WSMsgType.ERROR, aiohttp.WSMsgType.CLOSE):
                break
    finally:
        ws_policy_clients.discard(ws)
        logger.info(f"[WS-POLICY] Extension client disconnected ({len(ws_policy_clients)} remaining)")

    return ws


async def broadcast_incident_event(data: dict) -> None:
    """Broadcast real-time incident event to all connected SOC dashboard clients."""
    if not ws_feed_clients:
        return
    message = json.dumps(data)
    closed = set()
    for ws in ws_feed_clients:
        try:
            await ws.send_str(message)
        except Exception:
            closed.add(ws)
    ws_feed_clients.difference_update(closed)


async def broadcast_policy_update(org_id: str, policy_data: dict) -> None:
    """Broadcast live policy configuration updates directly to connected browser extensions."""
    if not ws_policy_clients:
        return
    payload = json.dumps({"type": "POLICY_UPDATE", "org_id": org_id, "policy": policy_data})
    closed = set()
    for ws in ws_policy_clients:
        try:
            await ws.send_str(payload)
        except Exception:
            closed.add(ws)
    ws_policy_clients.difference_update(closed)
