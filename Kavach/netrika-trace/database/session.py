"""SQLAlchemy Session Factory supporting PostgreSQL and SQLite dual-engine."""

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from database.models import Base

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///data/netrika.db")


def get_engine(url: str | None = None):
    db_url = url or os.getenv("DATABASE_URL", "sqlite:///data/netrika.db")
    connect_args = {}
    
    if db_url.startswith("sqlite"):
        connect_args["check_same_thread"] = False
        return create_engine(db_url, echo=False, connect_args=connect_args)
    else:
        # PostgreSQL / MySQL configuration with pooling
        return create_engine(
            db_url,
            echo=False,
            pool_size=10,
            max_overflow=20,
            pool_pre_ping=True,
        )


_engine = get_engine()
_SessionLocal = sessionmaker(bind=_engine, autocommit=False, autoflush=False)


def get_session() -> Session:
    """Return a new database session."""
    return _SessionLocal()


def init_database(url: str | None = None) -> None:
    """Initialize database tables."""
    engine = get_engine(url)
    Base.metadata.create_all(engine)
    engine.dispose()


def ensure_data_dir() -> None:
    """Create data directory if using SQLite."""
    db_url = os.getenv("DATABASE_URL", "sqlite:///data/netrika.db")
    if db_url.startswith("sqlite"):
        os.makedirs("data", exist_ok=True)
