"""SQLAlchemy ORM models for Netrika-Trace audit database.

Re-exports models from database.models for full backwards compatibility.
"""

from database.models import (
    AIEndpoint,
    AuditLog,
    Base,
    Device,
    EnterprisePolicy,
    EntityDetection,
    Incident,
    ModelEvaluation,
    Organization,
    PolicyConfig,
    User,
    generate_uuid,
    init_db,
)

__all__ = [
    "Base",
    "generate_uuid",
    "Incident",
    "EntityDetection",
    "PolicyConfig",
    "AIEndpoint",
    "Organization",
    "User",
    "Device",
    "EnterprisePolicy",
    "AuditLog",
    "ModelEvaluation",
    "init_db",
]
