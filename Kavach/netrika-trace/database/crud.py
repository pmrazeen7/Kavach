"""Enterprise Multi-Tenant CRUD Operations for Netrika-Trace Database."""

import json
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session

from database.models import (
    AIEndpoint,
    AuditLog,
    Device,
    EnterprisePolicy,
    EntityDetection,
    Incident,
    ModelEvaluation,
    Organization,
    PolicyConfig,
    User,
)
from database.session import get_session


# ── Organization CRUD ───────────────────────────────────────────────

def create_organization(name: str, domain: str, license_tier: str = "ENTERPRISE") -> Organization:
    session: Session = get_session()
    try:
        org = Organization(name=name, domain=domain, license_tier=license_tier)
        session.add(org)
        session.commit()
        session.refresh(org)
        return org
    finally:
        session.close()


def get_organization_by_id(org_id: str) -> Organization | None:
    session: Session = get_session()
    try:
        return session.query(Organization).filter(Organization.id == org_id).first()
    finally:
        session.close()


def get_organization_by_domain(domain: str) -> Organization | None:
    session: Session = get_session()
    try:
        return session.query(Organization).filter(Organization.domain == domain).first()
    finally:
        session.close()


def list_organizations() -> list[Organization]:
    session: Session = get_session()
    try:
        return session.query(Organization).order_by(Organization.name).all()
    finally:
        session.close()


# ── User CRUD ───────────────────────────────────────────────────────

def create_user(
    org_id: str,
    email: str,
    password_hash: str,
    full_name: str,
    role: str = "EMPLOYEE",
) -> User:
    session: Session = get_session()
    try:
        user = User(
            org_id=org_id,
            email=email.lower().strip(),
            password_hash=password_hash,
            full_name=full_name,
            role=role.upper(),
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        return user
    finally:
        session.close()


def get_user_by_email(email: str) -> User | None:
    session: Session = get_session()
    try:
        return session.query(User).filter(User.email == email.lower().strip()).first()
    finally:
        session.close()


def get_user_by_id(user_id: str) -> User | None:
    session: Session = get_session()
    try:
        return session.query(User).filter(User.id == user_id).first()
    finally:
        session.close()


def list_users_by_org(org_id: str) -> list[User]:
    session: Session = get_session()
    try:
        return session.query(User).filter(User.org_id == org_id).order_by(User.full_name).all()
    finally:
        session.close()


# ── Device Registration CRUD ────────────────────────────────────────

def register_device(
    device_uuid: str,
    user_id: str,
    org_id: str,
    os: str = "Windows",
    browser: str = "Chrome",
    ext_version: str = "1.0.0",
) -> Device:
    session: Session = get_session()
    try:
        device = session.query(Device).filter(Device.device_uuid == device_uuid).first()
        now = datetime.now(timezone.utc)
        if device:
            device.user_id = user_id
            device.org_id = org_id
            device.os = os
            device.browser = browser
            device.ext_version = ext_version
            device.last_seen = now
        else:
            device = Device(
                device_uuid=device_uuid,
                user_id=user_id,
                org_id=org_id,
                os=os,
                browser=browser,
                ext_version=ext_version,
                last_seen=now,
            )
            session.add(device)
        session.commit()
        session.refresh(device)
        return device
    finally:
        session.close()


def get_device_by_uuid(device_uuid: str) -> Device | None:
    session: Session = get_session()
    try:
        return session.query(Device).filter(Device.device_uuid == device_uuid).first()
    finally:
        session.close()


def list_devices_by_org(org_id: str) -> list[Device]:
    session: Session = get_session()
    try:
        return session.query(Device).filter(Device.org_id == org_id).order_by(Device.last_seen.desc()).all()
    finally:
        session.close()


# ── Enterprise Policy CRUD ─────────────────────────────────────────

def create_enterprise_policy(
    org_id: str,
    name: str = "Default Security Policy",
    warn_threshold: int = 30,
    block_threshold: int = 67,
    blocked_keywords: list[str] | None = None,
    allowed_domains: list[str] | None = None,
    blocked_domains: list[str] | None = None,
    allowed_file_types: list[str] | None = None,
    max_file_size_mb: int = 10,
    enable_semantic: bool = True,
    enable_code: bool = True,
    enable_secrets: bool = True,
    enable_pii: bool = True,
    enable_local_llm: bool = True,
) -> EnterprisePolicy:
    session: Session = get_session()
    try:
        policy = EnterprisePolicy(
            org_id=org_id,
            name=name,
            warn_threshold=warn_threshold,
            block_threshold=block_threshold,
            blocked_keywords_json=json.dumps(blocked_keywords or []),
            allowed_domains_json=json.dumps(allowed_domains or []),
            blocked_domains_json=json.dumps(blocked_domains or []),
            allowed_file_types_json=json.dumps(allowed_file_types or [".txt", ".pdf", ".docx", ".csv"]),
            max_file_size_mb=max_file_size_mb,
            enable_semantic=enable_semantic,
            enable_code=enable_code,
            enable_secrets=enable_secrets,
            enable_pii=enable_pii,
            enable_local_llm=enable_local_llm,
            is_active=True,
        )
        session.add(policy)
        session.commit()
        session.refresh(policy)
        return policy
    finally:
        session.close()


def get_active_policy_for_org(org_id: str) -> EnterprisePolicy | None:
    session: Session = get_session()
    try:
        return (
            session.query(EnterprisePolicy)
            .filter(EnterprisePolicy.org_id == org_id, EnterprisePolicy.is_active.is_(True))
            .first()
        )
    finally:
        session.close()


def update_enterprise_policy(policy_id: str, updates: dict[str, Any]) -> EnterprisePolicy | None:
    session: Session = get_session()
    try:
        policy = session.query(EnterprisePolicy).filter(EnterprisePolicy.id == policy_id).first()
        if not policy:
            return None

        for key, val in updates.items():
            if hasattr(policy, key):
                if isinstance(val, (list, dict)):
                    setattr(policy, f"{key}_json" if not key.endswith("_json") else key, json.dumps(val))
                else:
                    setattr(policy, key, val)

        policy.updated_at = datetime.now(timezone.utc)
        session.commit()
        session.refresh(policy)
        return policy
    finally:
        session.close()


# ── Audit Log CRUD ──────────────────────────────────────────────────

def log_action(
    action: str,
    resource: str,
    org_id: str | None = None,
    user_id: str | None = None,
    ip_address: str | None = None,
    details: dict[str, Any] | None = None,
) -> AuditLog:
    session: Session = get_session()
    try:
        log = AuditLog(
            action=action,
            resource=resource,
            org_id=org_id,
            user_id=user_id,
            ip_address=ip_address,
            details_json=json.dumps(details or {}),
        )
        session.add(log)
        session.commit()
        session.refresh(log)
        return log
    finally:
        session.close()


def get_audit_logs(org_id: str | None = None, limit: int = 100) -> list[AuditLog]:
    session: Session = get_session()
    try:
        query = session.query(AuditLog)
        if org_id:
            query = query.filter(AuditLog.org_id == org_id)
        return query.order_by(AuditLog.timestamp.desc()).limit(limit).all()
    finally:
        session.close()


# ── Model Evaluation CRUD ──────────────────────────────────────────

def save_model_evaluation(
    model_version: str,
    dataset_name: str,
    precision: float,
    recall: float,
    f1_score: float,
    confusion_matrix: dict[str, Any],
    org_id: str | None = None,
) -> ModelEvaluation:
    session: Session = get_session()
    try:
        eval_record = ModelEvaluation(
            org_id=org_id,
            model_version=model_version,
            dataset_name=dataset_name,
            precision=precision,
            recall=recall,
            f1_score=f1_score,
            confusion_matrix_json=json.dumps(confusion_matrix),
        )
        session.add(eval_record)
        session.commit()
        session.refresh(eval_record)
        return eval_record
    finally:
        session.close()


def get_latest_model_evaluations(
    limit: int = 10, org_id: str | None = None
) -> list[ModelEvaluation]:
    session: Session = get_session()
    try:
        query = session.query(ModelEvaluation)
        if org_id:
            query = query.filter(ModelEvaluation.org_id == org_id)
        return query.order_by(ModelEvaluation.timestamp.desc()).limit(limit).all()
    finally:
        session.close()


# ── Incident CRUD (Enhanced Multi-Tenant + Legacy) ─────────────────

def create_incident(
    incident_id: str,
    user_ip: str,
    target_host: str,
    target_url: str,
    http_method: str,
    payload_hash: str,
    payload_preview: str,
    payload_size_bytes: int,
    risk_score: int,
    decision: str,
    intent_label: str,
    entities_json: str,
    code_detected: bool,
    simulation_html: str | None = None,
    org_id: str | None = None,
    user_id: str | None = None,
    device_id: str | None = None,
    latency_ms: int = 0,
) -> Incident:
    session: Session = get_session()
    try:
        incident = Incident(
            id=incident_id,
            org_id=org_id,
            user_id=user_id,
            device_id=device_id,
            user_ip=user_ip,
            target_host=target_host,
            target_url=target_url,
            http_method=http_method,
            payload_hash=payload_hash,
            payload_preview="",
            payload_size_bytes=payload_size_bytes,
            risk_score=risk_score,
            decision=decision,
            intent_label=intent_label,
            entities_json=entities_json,
            code_detected=code_detected,
            simulation_html=simulation_html,
            latency_ms=latency_ms,
        )
        session.add(incident)
        session.commit()
        session.refresh(incident)
        return incident
    finally:
        session.close()


def create_entity_detection(
    incident_id: str,
    entity_type: str,
    entity_count: int,
    confidence_score: float,
    detector_source: str,
) -> EntityDetection:
    session: Session = get_session()
    try:
        detection = EntityDetection(
            incident_id=incident_id,
            entity_type=entity_type,
            entity_count=entity_count,
            confidence_score=confidence_score,
            detector_source=detector_source,
        )
        session.add(detection)
        session.commit()
        session.refresh(detection)
        return detection
    finally:
        session.close()


def get_incident_by_id(
    incident_id: str, org_id: str | None = None
) -> Incident | None:
    session: Session = get_session()
    try:
        query = session.query(Incident).filter(Incident.id == incident_id)
        if org_id:
            query = query.filter(Incident.org_id == org_id)
        return query.first()
    finally:
        session.close()


def get_recent_incidents(limit: int = 50, org_id: str | None = None) -> list[Incident]:
    session: Session = get_session()
    try:
        query = session.query(Incident)
        if org_id:
            query = query.filter(Incident.org_id == org_id)
        return query.order_by(Incident.timestamp.desc()).limit(limit).all()
    finally:
        session.close()


def search_incidents(
    query_str: str = "",
    org_id: str | None = None,
    decision: str | None = None,
    risk_min: int = 0,
    limit: int = 50,
) -> list[Incident]:
    session: Session = get_session()
    try:
        query = session.query(Incident)
        if org_id:
            query = query.filter(Incident.org_id == org_id)
        if decision:
            query = query.filter(Incident.decision == decision.upper())
        if risk_min > 0:
            query = query.filter(Incident.risk_score >= risk_min)
        if query_str:
            pattern = f"%{query_str}%"
            query = query.filter(
                or_(
                    Incident.id.like(pattern),
                    Incident.target_host.like(pattern),
                    Incident.intent_label.like(pattern),
                    Incident.user_ip.like(pattern),
                )
            )
        return query.order_by(Incident.timestamp.desc()).limit(limit).all()
    finally:
        session.close()


def get_incident_stats(
    org_id: str | None = None, window: str = "24h"
) -> dict[str, Any]:
    session: Session = get_session()
    try:
        durations = {
            "1h": timedelta(hours=1),
            "24h": timedelta(hours=24),
            "7d": timedelta(days=7),
            "30d": timedelta(days=30),
        }
        if window not in durations:
            raise ValueError(f"Unsupported analytics window: {window}")
        cutoff = datetime.now(timezone.utc) - durations[window]
        base_query = session.query(Incident).filter(Incident.timestamp >= cutoff)
        if org_id:
            base_query = base_query.filter(Incident.org_id == org_id)

        total = base_query.count()
        blocked = base_query.filter(Incident.decision == "BLOCK").count()
        warned = base_query.filter(Incident.decision == "WARN").count()
        allowed = base_query.filter(Incident.decision == "ALLOW").count()

        avg_latency = base_query.with_entities(func.avg(Incident.latency_ms)).scalar() or 0
        avg_risk = base_query.with_entities(func.avg(Incident.risk_score)).scalar() or 0

        return {
            "total": total,
            "blocked": blocked,
            "warned": warned,
            "allowed": allowed,
            "avg_latency_ms": round(float(avg_latency), 2),
            "avg_risk_score": round(float(avg_risk), 2),
        }
    finally:
        session.close()


def ensure_utc(dt: datetime | None) -> datetime:
    if dt is None:
        return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def get_traffic_breakdown(
    window: str = "24h", org_id: str | None = None
) -> list[dict[str, Any]]:
    session: Session = get_session()
    try:
        now = datetime.now(timezone.utc)
        if window == "1h":
            unit, count, step = "minute", 61, timedelta(minutes=1)
            cutoff = now - timedelta(hours=1)
            current_bucket = now.replace(second=0, microsecond=0)
        elif window == "24h":
            unit, count, step = "hour", 25, timedelta(hours=1)
            cutoff = now - timedelta(hours=24)
            current_bucket = now.replace(minute=0, second=0, microsecond=0)
        elif window == "7d":
            unit, count, step = "hour", 169, timedelta(hours=1)
            cutoff = now - timedelta(days=7)
            current_bucket = now.replace(minute=0, second=0, microsecond=0)
        elif window == "30d":
            unit, count, step = "day", 31, timedelta(days=1)
            cutoff = now - timedelta(days=30)
            current_bucket = now.replace(hour=0, minute=0, second=0, microsecond=0)
        else:
            raise ValueError(f"Unsupported analytics window: {window}")

        dialect = session.get_bind().dialect.name
        if dialect == "postgresql":
            bucket_expression = func.date_trunc(unit, func.timezone("UTC", Incident.timestamp))
        elif dialect == "sqlite":
            formats = {
                "minute": "%Y-%m-%d %H:%M:00",
                "hour": "%Y-%m-%d %H:00:00",
                "day": "%Y-%m-%d 00:00:00",
            }
            bucket_expression = func.strftime(formats[unit], Incident.timestamp)
        else:
            raise RuntimeError(f"Unsupported database for traffic aggregation: {dialect}")

        query = session.query(
            bucket_expression.label("bucket"),
            Incident.decision,
            func.count(Incident.id),
        ).filter(Incident.timestamp >= cutoff)
        if org_id:
            query = query.filter(Incident.org_id == org_id)
        grouped_counts = query.group_by(bucket_expression, Incident.decision).all()

        first_bucket = current_bucket - (count - 1) * step
        buckets: dict[datetime, dict[str, int]] = {}
        for index in range(count):
            bucket_start = first_bucket + index * step
            buckets[bucket_start] = {
                "hour": index,
                "timestamp": bucket_start.isoformat(),
                "BLOCK": 0,
                "WARN": 0,
                "ALLOW": 0,
            }

        for timestamp, decision, total in grouped_counts:
            if isinstance(timestamp, str):
                timestamp = datetime.fromisoformat(timestamp)
            bucket_start = ensure_utc(timestamp)
            if decision in ("BLOCK", "WARN", "ALLOW") and bucket_start in buckets:
                buckets[bucket_start][decision] += int(total)

        return list(buckets.values())
    finally:
        session.close()


def get_hourly_breakdown(hours: int = 24, org_id: str | None = None) -> list[dict[str, Any]]:
    if hours != 24:
        raise ValueError("Only 24-hour traffic aggregation is supported by this helper")
    return get_traffic_breakdown("24h", org_id=org_id)


def get_entity_type_breakdown(org_id: str | None = None) -> dict[str, int]:
    session: Session = get_session()
    try:
        query = session.query(EntityDetection.entity_type, func.sum(EntityDetection.entity_count)).join(Incident)
        if org_id:
            query = query.filter(Incident.org_id == org_id)
        results = query.group_by(EntityDetection.entity_type).all()
        return {row[0]: int(row[1]) for row in results}
    finally:
        session.close()


def get_weekly_compliance_stats(org_id: str | None = None) -> dict[str, int]:
    session: Session = get_session()
    try:
        week_ago = datetime.now(timezone.utc) - timedelta(days=7)
        query = session.query(EntityDetection).join(Incident).filter(Incident.timestamp >= week_ago)
        if org_id:
            query = query.filter(Incident.org_id == org_id)
        detections = query.all()

        stats = {"AADHAAR": 0, "PAN": 0, "SOURCE_CODE": 0, "total_incidents": 0}
        incident_ids = set()
        for det in detections:
            if det.entity_type == "AADHAAR":
                stats["AADHAAR"] += det.entity_count
            elif det.entity_type == "PAN":
                stats["PAN"] += det.entity_count
            elif det.entity_type == "SOURCE_CODE_DETECTED":
                stats["SOURCE_CODE"] += det.entity_count
            incident_ids.add(det.incident_id)
        stats["total_incidents"] = len(incident_ids)
        return stats
    finally:
        session.close()


def mark_incident_reviewed(
    incident_id: str,
    reviewed_by: str,
    notes: str = "",
    org_id: str | None = None,
) -> bool:
    session: Session = get_session()
    try:
        query = session.query(Incident).filter(Incident.id == incident_id)
        if org_id:
            query = query.filter(Incident.org_id == org_id)
        incident = query.first()
        if incident is None:
            return False
        incident.reviewed = True
        incident.reviewed_by = reviewed_by
        incident.notes = notes
        session.commit()
        return True
    finally:
        session.close()


def get_entity_detections_for_incident(incident_id: str) -> list[EntityDetection]:
    session: Session = get_session()
    try:
        return session.query(EntityDetection).filter(EntityDetection.incident_id == incident_id).all()
    finally:
        session.close()


# ── Policy & AI Endpoint Legacy Compatibility ──────────────────────

def get_policy_value(key: str, default: str = "") -> str:
    session: Session = get_session()
    try:
        config = session.query(PolicyConfig).filter(PolicyConfig.key == key).first()
        return config.value if config else default
    finally:
        session.close()


def set_policy_value(key: str, value: str) -> PolicyConfig:
    session: Session = get_session()
    try:
        config = session.query(PolicyConfig).filter(PolicyConfig.key == key).first()
        if config:
            config.value = value
            config.updated_at = datetime.now(timezone.utc)
        else:
            config = PolicyConfig(key=key, value=value)
            session.add(config)
        session.commit()
        session.refresh(config)
        return config
    finally:
        session.close()


def get_all_policy_config() -> dict[str, str]:
    session: Session = get_session()
    try:
        configs = session.query(PolicyConfig).all()
        return {c.key: c.value for c in configs}
    finally:
        session.close()


def get_active_endpoints() -> list[AIEndpoint]:
    session: Session = get_session()
    try:
        return session.query(AIEndpoint).filter(AIEndpoint.is_active.is_(True)).all()
    finally:
        session.close()


def get_all_endpoints() -> list[AIEndpoint]:
    session: Session = get_session()
    try:
        return session.query(AIEndpoint).order_by(AIEndpoint.hostname).all()
    finally:
        session.close()


def add_endpoint(hostname: str, display_name: str = "") -> AIEndpoint:
    session: Session = get_session()
    try:
        endpoint = AIEndpoint(hostname=hostname, display_name=display_name or hostname, is_active=True)
        session.add(endpoint)
        session.commit()
        session.refresh(endpoint)
        return endpoint
    finally:
        session.close()


def toggle_endpoint(endpoint_id: int, is_active: bool) -> bool:
    session: Session = get_session()
    try:
        endpoint = session.query(AIEndpoint).filter(AIEndpoint.id == endpoint_id).first()
        if endpoint is None:
            return False
        endpoint.is_active = is_active
        session.commit()
        return True
    finally:
        session.close()


def delete_endpoint(endpoint_id: int) -> bool:
    session: Session = get_session()
    try:
        endpoint = session.query(AIEndpoint).filter(AIEndpoint.id == endpoint_id).first()
        if endpoint is None:
            return False
        session.delete(endpoint)
        session.commit()
        return True
    finally:
        session.close()


def seed_default_endpoints() -> None:
    session: Session = get_session()
    try:
        count = session.query(AIEndpoint).count()
        if count > 0:
            return

        defaults = [
            ("api.openai.com", "OpenAI API"),
            ("chat.openai.com", "ChatGPT"),
            ("api.anthropic.com", "Anthropic API"),
            ("generativelanguage.googleapis.com", "Google Gemini API"),
            ("bard.google.com", "Google Bard"),
            ("api.perplexity.ai", "Perplexity API"),
            ("api.cohere.com", "Cohere API"),
            ("api.mistral.ai", "Mistral API"),
            ("huggingface.co", "HuggingFace"),
            ("replicate.com", "Replicate"),
            ("claude.ai", "Claude"),
            ("gemini.google.com", "Gemini Web"),
            ("copilot.microsoft.com", "Microsoft Copilot"),
            ("api.groq.com", "Groq API"),
            ("together.ai", "Together AI"),
        ]
        for hostname, display_name in defaults:
            endpoint = AIEndpoint(hostname=hostname, display_name=display_name, is_active=True)
            session.add(endpoint)
        session.commit()
    finally:
        session.close()


def get_endpoint_incident_stats(org_id: str | None = None) -> list[dict[str, Any]]:
    session: Session = get_session()
    try:
        query = session.query(
            Incident.target_host,
            func.count(Incident.id).label("total"),
            func.sum(case((Incident.decision == "BLOCK", 1), else_=0)).label("blocked"),
            func.sum(case((Incident.decision == "WARN", 1), else_=0)).label("warned"),
        )
        if org_id:
            query = query.filter(Incident.org_id == org_id)
        results = query.group_by(Incident.target_host).all()
        return [
            {
                "hostname": row[0],
                "total": int(row[1]),
                "blocked": int(row[2] or 0),
                "warned": int(row[3] or 0),
            }
            for row in results
        ]
    finally:
        session.close()


# ── Default Seeding Helpers ────────────────────────────────────────

def seed_enterprise_defaults() -> tuple[Organization, User, EnterprisePolicy]:
    """Seed initial organization, admin user, and policy for multi-tenant setup."""
    session: Session = get_session()
    try:
        org = session.query(Organization).filter(Organization.domain == "enterprise.com").first()
        if not org:
            org = Organization(name="Default Enterprise", domain="enterprise.com", license_tier="ENTERPRISE")
            session.add(org)
            session.commit()
            session.refresh(org)

        # Import security helper lazily
        from backend.auth.security import hash_password

        user = session.query(User).filter(User.email == "admin@enterprise.com").first()
        if not user:
            user = User(
                org_id=org.id,
                email="admin@enterprise.com",
                password_hash=hash_password("Admin@123456"),
                full_name="Enterprise Super Admin",
                role="SUPER_ADMIN",
            )
            session.add(user)
            session.commit()
            session.refresh(user)
        else:
            user.password_hash = hash_password("Admin@123456")
            session.commit()

        policy = session.query(EnterprisePolicy).filter(EnterprisePolicy.org_id == org.id).first()
        if not policy:
            policy = EnterprisePolicy(
                org_id=org.id,
                name="Default Enterprise Security Policy",
                warn_threshold=30,
                block_threshold=70,
                blocked_keywords_json=json.dumps(["confidential", "internal-only", "trade-secret"]),
                allowed_domains_json=json.dumps(["chatgpt.com", "gemini.google.com", "claude.ai"]),
                blocked_domains_json=json.dumps([]),
                allowed_file_types_json=json.dumps([".txt", ".pdf", ".docx", ".csv"]),
                max_file_size_mb=10,
                enable_semantic=True,
                enable_code=True,
                enable_secrets=True,
                enable_pii=True,
                enable_local_llm=True,
                is_active=True,
            )
            session.add(policy)
            session.commit()
            session.refresh(policy)

        return org, user, policy
    finally:
        session.close()
