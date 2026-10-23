"""Scanner API: scan text, manage settings, allowlist, fingerprint sources, canaries.

Responses never contain raw secrets. Findings carry offsets, a masked preview and
a keyed fingerprint only.
"""

from __future__ import annotations

import asyncio
import logging
import os
import pathlib
import secrets as _secrets
from dataclasses import asdict

from aiohttp import web

from backend.auth.rbac import require_auth, require_permission
from scanner import service
from scanner.fingerprints import ingest_files
from scanner.settings import Settings

logger = logging.getLogger(__name__)

MAX_TEXT = 200_000
# Fingerprint sources must live inside this directory tree (admins cannot probe the whole disk).
SOURCE_ROOT = pathlib.Path(os.getenv("SCANNER_SOURCE_ROOT", pathlib.Path(__file__).resolve().parents[3])).resolve()


def _str_list(value, limit: int = 50, max_len: int = 400) -> list[str]:
    if not isinstance(value, list):
        return []
    return [v[:max_len] for v in value[:limit] if isinstance(v, str)]


@require_auth
async def api_scan(request: web.Request) -> web.Response:
    """POST /api/v1/scanner/scan {text, history?, policy?, confirmed?, deep?}"""
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "Invalid JSON"}, status=400)
    text = body.get("text", "")
    if not isinstance(text, str) or len(text) > MAX_TEXT:
        return web.json_response({"error": f"text must be a string up to {MAX_TEXT} characters"}, status=400)
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(
        None,
        lambda: service.scan_text(
            text,
            history=_str_list(body.get("history"), 6, 20_000),
            policy=body.get("policy") if body.get("policy") in ("strict", "balanced", "relaxed") else None,
            confirmed=_str_list(body.get("confirmed"), 100, 64),
            deep=bool(body.get("deep", False)),
        ),
    )
    return web.json_response(result.to_dict())


def _settings_payload() -> dict:
    store = service.get_store()
    s = store.settings()
    return {**asdict(s), "fingerprint_count": len(store.fingerprints()), "source_root": SOURCE_ROOT.name}


@require_auth
async def api_get_settings(request: web.Request) -> web.Response:
    return web.json_response(_settings_payload())


@require_permission("edit_policies")
async def api_update_settings(request: web.Request) -> web.Response:
    """PATCH /api/v1/scanner/settings"""
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "Invalid JSON"}, status=400)
    store = service.get_store()
    s = store.settings()
    for key in ("profile", "tokenize", "scan_output"):
        if key in body:
            setattr(s, key, body[key])
    for key in ("internal_hosts", "codenames", "fingerprint_sources", "allowlist"):
        if key in body:
            setattr(s, key, _str_list(body[key], 200, 400))
    if "custom_patterns" in body and isinstance(body["custom_patterns"], list):
        import re

        good = []
        for p in body["custom_patterns"][:50]:
            try:
                re.compile(p.get("pattern", ""))
            except (re.error, AttributeError):
                return web.json_response({"error": f"Invalid pattern: {str(p)[:60]}"}, status=400)
            good.append(p)
        s.custom_patterns = good
    store.save_settings(s)
    return web.json_response(_settings_payload())


@require_auth
async def api_allow(request: web.Request) -> web.Response:
    """POST /api/v1/scanner/allow {fp}: mark one finding as safe (false positive)."""
    body = await request.json()
    fp = body.get("fp")
    if not isinstance(fp, str) or len(fp) != 32:
        return web.json_response({"error": "fp must be a 32-character fingerprint"}, status=400)
    store = service.get_store()
    s = store.settings()
    if fp not in s.allowlist:
        s.allowlist.append(fp)
        store.save_settings(s)
    return web.json_response({"allowlisted": True, "count": len(store.settings().allowlist)})


@require_permission("edit_policies")
async def api_unallow(request: web.Request) -> web.Response:
    fp = request.match_info["fp"]
    store = service.get_store()
    s = store.settings()
    s.allowlist = [a for a in s.allowlist if a != fp]
    store.save_settings(s)
    return web.json_response({"count": len(s.allowlist)})


def _inside_root(p: str) -> pathlib.Path | None:
    try:
        path = pathlib.Path(p).expanduser().resolve()
    except OSError:
        return None
    return path if SOURCE_ROOT in path.parents or path == SOURCE_ROOT else None


@require_permission("edit_policies")
async def api_ingest(request: web.Request) -> web.Response:
    """POST /api/v1/scanner/fingerprints/ingest {paths?}: fingerprint the secrets in .env/JSON files."""
    body = await request.json()
    store = service.get_store()
    s = store.settings()
    paths = _str_list(body.get("paths"), 50, 400) or s.fingerprint_sources
    if not paths:
        paths = [str(p) for p in (SOURCE_ROOT / ".env", SOURCE_ROOT / "netrika-trace" / ".env") if p.exists()]
    allowed, rejected = [], 0
    for p in paths:
        ok = _inside_root(p)
        if ok:
            allowed.append(str(ok))
        else:
            rejected += 1
    fps = store.fingerprints()
    report = ingest_files(fps, allowed)
    store.save_fingerprints(fps)
    s.fingerprint_sources = allowed or s.fingerprint_sources
    store.save_settings(s)
    report["rejected_outside_root"] = rejected
    report["total"] = len(fps)
    return web.json_response(report)


@require_permission("edit_policies")
async def api_add_canary(request: web.Request) -> web.Response:
    """POST /api/v1/scanner/canaries {label, value?}: plant a tripwire. A generated value is returned once."""
    body = await request.json()
    label = str(body.get("label") or "canary")[:60]
    value = body.get("value")
    generated = not isinstance(value, str) or not value
    if generated:
        value = "sk_live_" + _secrets.token_urlsafe(30)
    store = service.get_store()
    fps = store.fingerprints()
    if not fps.add(value, f"canary:{label}", canary=True):
        return web.json_response({"error": "Canary must be at least 8 characters"}, status=400)
    store.save_fingerprints(fps)
    out = {"label": label, "total": len(fps)}
    if generated:
        out["value"] = value  # shown once; only its fingerprint is stored
    return web.json_response(out)
