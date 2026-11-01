"""SQLAlchemy session factory for Netrika-Trace.

Re-exports session utilities from database.session for backwards compatibility.
"""

from database.session import DATABASE_URL, ensure_data_dir, get_engine, get_session, init_database

__all__ = ["DATABASE_URL", "get_session", "init_database", "ensure_data_dir", "get_engine"]
