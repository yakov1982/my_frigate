from __future__ import annotations

from sqlalchemy.orm import Session

from lexima_dms.db.models import ApprovalStep, Document, DocumentStatus, StepState


def actionable_step(document: Document) -> ApprovalStep | None:
    """
    Returns the step that is currently actionable (first pending step
    with all previous steps approved). If document has no steps, returns None.
    """
    steps = sorted(document.steps, key=lambda s: s.step_order)
    for step in steps:
        if step.state != StepState.pending:
            continue
        prev = [s for s in steps if s.step_order < step.step_order]
        if all(s.state == StepState.approved for s in prev):
            return step
    return None


def recompute_document_status(db: Session, document: Document) -> None:
    steps = sorted(document.steps, key=lambda s: s.step_order)
    if not steps:
        document.status = DocumentStatus.draft
        return

    if any(s.state == StepState.rejected for s in steps):
        document.status = DocumentStatus.rejected
        return

    if all(s.state == StepState.approved for s in steps):
        document.status = DocumentStatus.approved
        return

    # still have pending steps
    document.status = DocumentStatus.in_review

