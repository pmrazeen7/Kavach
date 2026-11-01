"""Role-Based Access Control (RBAC) & Middleware Engine."""

from typing import Any
from aiohttp import web
from backend.auth.security import decode_token
from database.crud import get_user_by_id

ROLE_PERMISSIONS = {
    "SUPER_ADMIN": ["all"],
    "ORG_ADMIN": ["view_incidents", "edit_policies", "manage_users", "manage_devices", "view_analytics", "export_reports"],
    "ANALYST": ["view_incidents", "review_incidents", "view_analytics", "export_reports"],
    "EMPLOYEE": ["use_extension", "register_device"],
}


def verify_user_permissions(user_role: str, required_permission: str) -> bool:
    """Check if a user role has the required permission."""
    role = user_role.upper()
    if role == "SUPER_ADMIN":
        return True
    allowed_perms = ROLE_PERMISSIONS.get(role, [])
    return "all" in allowed_perms or required_permission in allowed_perms


def get_current_user_from_request(request: web.Request) -> dict[str, Any] | None:
    """Extract authenticated user context from request headers (Authorization: Bearer <token> or X-API-Token)."""
    auth_header = request.headers.get("Authorization", "")
    token = ""

    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    elif "X-API-Token" in request.headers:
        token = request.headers["X-API-Token"].strip()

    if not token:
        return None

    payload = decode_token(token)
    if not payload:
        return None

    user_id = payload.get("sub")
    if not user_id:
        return None

    user = get_user_by_id(user_id)
    if not user or not user.is_active:
        return None

    return {
        "id": user.id,
        "org_id": user.org_id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
    }


def require_auth(handler):
    """Decorator requiring a valid JWT token."""
    async def wrapper(request: web.Request):
        if request.method == "OPTIONS":
            return await handler(request)

        user = get_current_user_from_request(request)
        if not user:
            return web.json_response({"error": "Unauthorized — Valid JWT Bearer Token Required"}, status=401)

        request["user"] = user
        return await handler(request)

    return wrapper


def require_permission(required_permission: str):
    """Decorator enforcing specific RBAC permission."""
    def decorator(handler):
        async def wrapper(request: web.Request):
            if request.method == "OPTIONS":
                return await handler(request)

            user = get_current_user_from_request(request)
            if not user:
                return web.json_response({"error": "Unauthorized — Token Required"}, status=401)

            if not verify_user_permissions(user["role"], required_permission):
                return web.json_response({"error": f"Forbidden — Permission '{required_permission}' required"}, status=403)

            request["user"] = user
            return await handler(request)

        return wrapper

    return decorator
