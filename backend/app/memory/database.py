"""
Database setup and session management for memory module.
Uses SQLite for MVP.
"""

import os
import logging
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from contextlib import contextmanager

from app.memory.models import Base

logger = logging.getLogger(__name__)

# Paths
DATA_DIR = Path(__file__).parent.parent.parent / "data"
AUDIO_DIR = DATA_DIR / "audio"
FACES_DIR = DATA_DIR / "faces"
DB_PATH = DATA_DIR / "memory.db"

# Ensure directories exist
DATA_DIR.mkdir(parents=True, exist_ok=True)
AUDIO_DIR.mkdir(parents=True, exist_ok=True)
FACES_DIR.mkdir(parents=True, exist_ok=True)

# Database engine
DATABASE_URL = f"sqlite:///{DB_PATH}"
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # SQLite specific
    echo=False  # Set True for SQL debugging
)

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db():
    """Initialize database tables."""
    logger.info(f"Initializing database at {DB_PATH}")
    Base.metadata.create_all(bind=engine)
    logger.info("Database initialized")


def get_db() -> Session:
    """Get database session (for FastAPI dependency injection)."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def get_db_session() -> Session:
    """Context manager for database session."""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def get_audio_path(interaction_id: str) -> Path:
    """Get the path for storing an interaction's audio."""
    return AUDIO_DIR / f"{interaction_id}.webm"


def get_face_path(person_id: str) -> Path:
    """Get the path for storing a person's reference face image."""
    return FACES_DIR / f"{person_id}.jpg"
