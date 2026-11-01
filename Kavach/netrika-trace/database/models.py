"""Enterprise Multi-Tenant SQLAlchemy ORM Models for Netrika-Trace."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    create_engine,
)
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


def generate_uuid() -> str:
    return str(uuid.uuid4())


# ── Organization & Multi-Tenancy ───────────────────────────────────

class Organization(Base):
    __tablename__ = "organizations"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    domain = Column(String(255), unique=True, nullable=False)
    license_tier = Column(String(50), nullable=False, default="ENTERPRISE")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    users = relationship("User", back_populates="organization", cascade="all, delete-orphan")
    devices = relationship("Device", back_populates="organization", cascade="all, delete-orphan")
    policies = relationship("EnterprisePolicy", back_populates="organization", cascade="all, delete-orphan")
    incidents = relationship("Incident", back_populates="organization", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Organization {self.name} ({self.domain})>"


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id"), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False, default="EMPLOYEE")  # SUPER_ADMIN, ORG_ADMIN, ANALYST, EMPLOYEE
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    organization = relationship("Organization", back_populates="users")
    devices = relationship("Device", back_populates="user", cascade="all, delete-orphan")
    incidents = relationship("Incident", back_populates="user")

    def __repr__(self) -> str:
        return f"<User {self.email} ({self.role})>"


class Device(Base):
    __tablename__ = "devices"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    device_uuid = Column(String(100), unique=True, nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    org_id = Column(String(36), ForeignKey("organizations.id"), nullable=False)
    os = Column(String(100), nullable=True)
    browser = Column(String(100), nullable=True)
    ext_version = Column(String(50), nullable=True)
    last_seen = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    organization = relationship("Organization", back_populates="devices")
    user = relationship("User", back_populates="devices")
    incidents = relationship("Incident", back_populates="device")

    def __repr__(self) -> str:
        return f"<Device {self.device_uuid} | OS: {self.os}>"


# ── Enterprise Policy Management ───────────────────────────────────

class EnterprisePolicy(Base):
    __tablename__ = "enterprise_policies"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id"), nullable=False)
    name = Column(String(255), nullable=False, default="Default Security Policy")
    warn_threshold = Column(Integer, nullable=False, default=30)
    block_threshold = Column(Integer, nullable=False, default=67)
    blocked_keywords_json = Column(Text, nullable=True, default="[]")
    allowed_domains_json = Column(Text, nullable=True, default="[]")
    blocked_domains_json = Column(Text, nullable=True, default="[]")
    allowed_file_types_json = Column(Text, nullable=True, default="[\".txt\", \".pdf\", \".docx\", \".csv\"]")
    max_file_size_mb = Column(Integer, nullable=False, default=10)
    enable_semantic = Column(Boolean, nullable=False, default=True)
    enable_code = Column(Boolean, nullable=False, default=True)
    enable_secrets = Column(Boolean, nullable=False, default=True)
    enable_pii = Column(Boolean, nullable=False, default=True)
    enable_local_llm = Column(Boolean, nullable=False, default=True)
    is_active = Column(Boolean, nullable=False, default=True)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    organization = relationship("Organization", back_populates="policies")

    def __repr__(self) -> str:
        return f"<EnterprisePolicy {self.name} (Org: {self.org_id})>"


# ── Audit & Incident Tracking ──────────────────────────────────────

class Incident(Base):
    __tablename__ = "incidents"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id"), nullable=True, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    device_id = Column(String(36), ForeignKey("devices.id"), nullable=True, index=True)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True)
    user_ip = Column(String(45), nullable=False)
    target_host = Column(String(255), nullable=False)
    target_url = Column(String(2048), nullable=False)
    http_method = Column(String(10), nullable=False, default="POST")
    payload_hash = Column(String(64), nullable=False)
    payload_preview = Column(String(200), nullable=True)
    payload_size_bytes = Column(Integer, nullable=False, default=0)
    risk_score = Column(Integer, nullable=False, default=0)
    decision = Column(String(10), nullable=False, default="ALLOW")
    intent_label = Column(String(20), nullable=True)
    entities_json = Column(Text, nullable=True)
    code_detected = Column(Boolean, nullable=False, default=False)
    simulation_html = Column(Text, nullable=True)
    reviewed = Column(Boolean, nullable=False, default=False)
    reviewed_by = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    latency_ms = Column(Integer, nullable=False, default=0)

    organization = relationship("Organization", back_populates="incidents")
    user = relationship("User", back_populates="incidents")
    device = relationship("Device", back_populates="incidents")
    entity_detections = relationship("EntityDetection", back_populates="incident", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Incident {self.id} | {self.decision} | score={self.risk_score}>"


class EntityDetection(Base):
    __tablename__ = "entity_detections"

    id = Column(Integer, primary_key=True, autoincrement=True)
    incident_id = Column(String(36), ForeignKey("incidents.id"), nullable=False)
    entity_type = Column(String(50), nullable=False)
    entity_count = Column(Integer, nullable=False, default=1)
    confidence_score = Column(Float, nullable=True)
    detector_source = Column(String(20), nullable=False, default="REGEX")

    incident = relationship("Incident", back_populates="entity_detections")

    def __repr__(self) -> str:
        return f"<EntityDetection {self.entity_type} x{self.entity_count}>"


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id"), nullable=True, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    action = Column(String(100), nullable=False)
    resource = Column(String(255), nullable=False)
    ip_address = Column(String(45), nullable=True)
    details_json = Column(Text, nullable=True)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True)

    def __repr__(self) -> str:
        return f"<AuditLog {self.action} on {self.resource}>"


class ModelEvaluation(Base):
    __tablename__ = "model_evaluations"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id"), nullable=True)
    model_version = Column(String(100), nullable=False)
    dataset_name = Column(String(100), nullable=False)
    precision = Column(Float, nullable=False, default=0.0)
    recall = Column(Float, nullable=False, default=0.0)
    f1_score = Column(Float, nullable=False, default=0.0)
    confusion_matrix_json = Column(Text, nullable=True)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    def __repr__(self) -> str:
        return f"<ModelEvaluation {self.model_version} F1={self.f1_score}>"


# ── Legacy Compatibility Models ────────────────────────────────────

class PolicyConfig(Base):
    __tablename__ = "policy_config"

    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String(100), unique=True, nullable=False)
    value = Column(Text, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class AIEndpoint(Base):
    __tablename__ = "ai_endpoints"

    id = Column(Integer, primary_key=True, autoincrement=True)
    hostname = Column(String(255), unique=True, nullable=False)
    display_name = Column(String(255), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    added_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


def init_db(database_url: str = "sqlite:///data/netrika.db") -> None:
    """Create all database tables."""
    engine = create_engine(database_url, echo=False)
    Base.metadata.create_all(engine)
    engine.dispose()
