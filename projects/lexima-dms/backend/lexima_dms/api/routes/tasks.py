from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import and_, exists
from sqlalchemy.orm import Session, aliased

from lexima_dms.api.deps import get_current_user, get_db
from lexima_dms.api.schemas import TaskItem
from lexima_dms.db.models import ApprovalStep, Document, StepState, User

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("/my", response_model=list[TaskItem])
def my_tasks(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[TaskItem]:
    prev = aliased(ApprovalStep)

    actionable = (
        db.query(ApprovalStep, Document)
        .join(Document, Document.id == ApprovalStep.document_id)
        .filter(ApprovalStep.approver_user_id == current_user.id)
        .filter(ApprovalStep.state == StepState.pending)
        .filter(
            ~exists().where(
                and_(
                    prev.document_id == ApprovalStep.document_id,
                    prev.step_order < ApprovalStep.step_order,
                    prev.state != StepState.approved,
                )
            )
        )
        .order_by(Document.created_at.desc())
        .limit(200)
        .all()
    )

    out: list[TaskItem] = []
    for step, doc in actionable:
        out.append(
            TaskItem(
                document_id=doc.id,
                title=doc.title,
                step_id=step.id,
                step_order=step.step_order,
                state=step.state.value,
            )
        )
    return out

