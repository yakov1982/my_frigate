from __future__ import annotations

from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from lexima_dms.core.config import get_settings


def _db_path() -> Path:
    settings = get_settings()
    return settings.data_dir / "app.db"


def get_engine() -> Engine:
    path = _db_path()
    return create_engine(
        f"sqlite:///{path}",
        connect_args={"check_same_thread": False},
        future=True,
    )


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=get_engine())


def db_session() -> Session:
    return SessionLocal()

