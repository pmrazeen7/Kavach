"""Database-Driven Enterprise Policy Management API Routes (v1)."""

import json
import logging
from aiohttp import web
from backend.auth.rbac import get_current_user_from_request, require_permission
from database.crud import (
    create_enterprise_policy,
    get_active_policy_for_org,
    log_action,
    update_enterprise_policy,
)

logger = logging.getLogger(__name__)


async def api_get_policy(request: web.Request) -> web.Response:
    """GET /api/v1/policies — Fetch active policy for organization."""
    try:
        user = get_current_user_from_request(request)
        org_id = user["org_id"] if user else "default-org"

        policy = get_active_policy_for_org(org_id)
        if not policy:
            # Auto-seed policy if none exists
            policy = create_enterprise_policy(org_id=org_id)

        return web.json_response({
            "id": policy.id,
            "org_id": policy.org_id,
            "name": policy.name,
            "warn_threshold": policy.warn_threshold,
            "block_threshold": policy.block_threshold,
            "blocked_keywords": json.loads(policy.blocked_keywords_json or "[]"),
            "allowed_domains": json.loads(policy.allowed_domains_json or "[]"),
            "blocked_domains": json.loads(policy.blocked_domains_json or "[]"),
            "allowed_file_types": json.loads(policy.allowed_file_types_json or "[]"),
            "max_file_size_mb": policy.max_file_size_mb,
            "enable_semantic": policy.enable_semantic,
            "enable_code": policy.enable_code,
            "enable_secrets": policy.enable_secrets,
            "enable_pii": policy.enable_pii,
            "enable_local_llm": policy.enable_local_llm,
            "updated_at": policy.updated_at.isoformat() if policy.updated_at else None,
        })
    except Exception as e:
        logger.error(f"[POLICY-GET] Error: {e}")
        return web.json_response({"error": str(e)}, status=500)


@require_permission("edit_policies")
async def api_update_policy(request: web.Request) -> web.Response:
    """PATCH /api/v1/policies — Update organization security policy and push live WS update."""
    try:
        user = request["user"]
        org_id = user["org_id"]
        body = await request.json()

        policy = get_active_policy_for_org(org_id)
        if not policy:
            policy = create_enterprise_policy(org_id=org_id)

        updated_policy = update_enterprise_policy(policy.id, body)

        log_action(action="UPDATE_POLICY", resource=f"POLICY:{policy.id}", org_id=org_id, user_id=user["id"], details=body)

        # Broadcast live policy update to all connected extensions & web clients via WebSocket
        try:
            from backend.websocket.broker import broadcast_policy_update
            await broadcast_policy_update(org_id, {
                "warn_threshold": updated_policy.warn_threshold,
                "block_threshold": updated_policy.block_threshold,
                "blocked_keywords": json.loads(updated_policy.blocked_keywords_json or "[]"),
                "allowed_domains": json.loads(updated_policy.allowed_domains_json or "[]"),
                "blocked_domains": json.loads(updated_policy.blocked_domains_json or "[]"),
            })
        except Exception as ws_err:
            logger.warning(f"[POLICY-UPDATE] WS notification warning: {ws_err}")

        return web.json_response({
            "status": "updated",
            "policy_id": updated_policy.id,
            "updated_at": updated_policy.updated_at.isoformat(),
        })
    except Exception as e:
        logger.error(f"[POLICY-UPDATE] Error: {e}")
        return web.json_response({"error": str(e)}, status=500)


async def api_sync_extension_policy(request: web.Request) -> web.Response:
    """GET /api/v1/policies/extension-sync — Light policy config payload for Chrome extension."""
    try:
        org_id = request.query.get("org_id", "default-org")
        policy = get_active_policy_for_org(org_id)
        if not policy:
            policy = create_enterprise_policy(org_id=org_id)

        return web.json_response({
            "warn_threshold": policy.warn_threshold,
            "block_threshold": policy.block_threshold,
            "blocked_keywords": json.loads(policy.blocked_keywords_json or "[]"),
            "allowed_domains": json.loads(policy.allowed_domains_json or "[]"),
            "blocked_domains": json.loads(policy.blocked_domains_json or "[]"),
            "allowed_file_types": json.loads(policy.allowed_file_types_json or "[]"),
            "max_file_size_mb": policy.max_file_size_mb,
            "enable_code": policy.enable_code,
            "enable_secrets": policy.enable_secrets,
            "enable_pii": policy.enable_pii,
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)
