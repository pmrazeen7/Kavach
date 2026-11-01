"""Authentication & Device Registration API Routes (v1)."""

import logging
from aiohttp import web
from backend.auth.rbac import get_current_user_from_request, require_auth, require_permission
from backend.auth.security import create_access_token, create_refresh_token, decode_token, verify_password
from database.crud import (
    get_device_by_uuid,
    get_organization_by_id,
    get_user_by_email,
    list_devices_by_org,
    log_action,
    register_device,
)

logger = logging.getLogger(__name__)


async def api_login(request: web.Request) -> web.Response:
    """POST /api/v1/auth/login — Authenticate user and issue JWT."""
    try:
        body = await request.json()
        email = body.get("email", "").strip()
        password = body.get("password", "").strip()

        if not email or not password:
            return web.json_response({"error": "Email and password are required"}, status=400)

        user = get_user_by_email(email)
        if not user or not verify_password(password, user.password_hash):
            return web.json_response({"error": "Invalid email or password"}, status=401)

        if not user.is_active:
            return web.json_response({"error": "User account is disabled"}, status=403)

        org = get_organization_by_id(user.org_id)

        access_token = create_access_token({
            "sub": user.id,
            "org_id": user.org_id,
            "role": user.role,
            "email": user.email,
        })
        refresh_token = create_refresh_token(user.id, user.org_id)

        log_action(action="LOGIN", resource="USER", org_id=user.org_id, user_id=user.id, details={"email": email})

        return web.json_response({
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "Bearer",
            "user": {
                "id": user.id,
                "email": user.email,
                "full_name": user.full_name,
                "role": user.role,
                "org_id": user.org_id,
                "organization_name": org.name if org else "Enterprise",
            },
        })
    except Exception as e:
        logger.error(f"[AUTH-LOGIN] Error: {e}")
        return web.json_response({"error": str(e)}, status=500)


async def api_refresh_token(request: web.Request) -> web.Response:
    """POST /api/v1/auth/refresh — Refresh JWT access token."""
    try:
        body = await request.json()
        token = body.get("refresh_token", "").strip()
        payload = decode_token(token)

        if not payload or payload.get("type") != "refresh":
            return web.json_response({"error": "Invalid or expired refresh token"}, status=401)

        user_id = payload.get("sub")
        org_id = payload.get("org_id")

        new_access_token = create_access_token({"sub": user_id, "org_id": org_id})
        return web.json_response({"access_token": new_access_token, "token_type": "Bearer"})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def api_register_device(request: web.Request) -> web.Response:
    """POST /api/v1/auth/register-device — Register/heartbeat client browser extension device."""
    try:
        body = await request.json()
        device_uuid = body.get("device_uuid", "").strip()
        user_id = body.get("user_id", "").strip()
        org_id = body.get("org_id", "").strip()
        os_name = body.get("os", "Windows")
        browser = body.get("browser", "Chrome")
        ext_version = body.get("ext_version", "1.0.0")

        if not device_uuid:
            return web.json_response({"error": "device_uuid is required"}, status=400)

        # Fallback to current authenticated user if not provided in body
        auth_user = get_current_user_from_request(request)
        if auth_user:
            user_id = user_id or auth_user["id"]
            org_id = org_id or auth_user["org_id"]

        device = register_device(
            device_uuid=device_uuid,
            user_id=user_id or "default-user",
            org_id=org_id or "default-org",
            os=os_name,
            browser=browser,
            ext_version=ext_version,
        )

        return web.json_response({
            "status": "registered",
            "device_id": device.id,
            "device_uuid": device.device_uuid,
            "last_seen": device.last_seen.isoformat(),
        })
    except Exception as e:
        logger.error(f"[REGISTER-DEVICE] Error: {e}")
        return web.json_response({"error": str(e)}, status=500)


@require_auth
async def api_me(request: web.Request) -> web.Response:
    """GET /api/v1/auth/me — Get current user profile."""
    user = request["user"]
    org = get_organization_by_id(user["org_id"])
    return web.json_response({
        "user": user,
        "organization": {
            "id": org.id if org else "",
            "name": org.name if org else "Default Enterprise",
            "domain": org.domain if org else "enterprise.com",
            "license_tier": org.license_tier if org else "ENTERPRISE",
        },
    })


@require_permission("manage_devices")
async def api_list_devices(request: web.Request) -> web.Response:
    """GET /api/v1/auth/devices — List registered devices for organization."""
    user = request["user"]
    devices = list_devices_by_org(user["org_id"])
    data = [
        {
            "id": d.id,
            "device_uuid": d.device_uuid,
            "user_id": d.user_id,
            "os": d.os,
            "browser": d.browser,
            "ext_version": d.ext_version,
            "last_seen": d.last_seen.isoformat() if d.last_seen else None,
        }
        for d in devices
    ]
    return web.json_response(data)
