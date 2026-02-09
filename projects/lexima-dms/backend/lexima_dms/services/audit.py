from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from lexima_dms.db.models import AuditLog, User


def audit(
    db: Session,
    *,
    actor: User,
    action: str,
    document_id: int | None = None,
    meta: dict[str, Any] | None = None,
) -> None:
    db.add(AuditLog(actor_user_id=actor.id, action=action, document_id=document_id, meta=meta))

