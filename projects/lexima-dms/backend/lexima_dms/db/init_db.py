from __future__ import annotations

from lexima_dms.db.models import Base
from lexima_dms.db.session import get_engine


def init_db() -> None:
    engine = get_engine()
    Base.metadata.create_all(bind=engine)

