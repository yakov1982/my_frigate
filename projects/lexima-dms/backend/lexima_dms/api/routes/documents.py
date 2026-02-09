from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from lexima_dms.api.deps import get_current_user, get_db
from lexima_dms.api.schemas import DocumentListItem, DocumentOut
from lexima_dms.db.models import (
    ApprovalStep,
    Document,
    DocumentStatus,
    DocumentVersion,
    StepState,
    User,
)
from lexima_dms.services.audit import audit
from lexima_dms.services.workflow import actionable_step, recompute_document_status
from lexima_dms.storage.files import resolve_storage_path, save_version_file

router = APIRouter(prefix="/documents", tags=["documents"])


def _parse_approvers(raw: str) -> list[str]:
    if not raw.strip():
        return []
    raw = raw.replace(";", ",").replace("\n", ",")
    return [p.strip() for p in raw.split(",") if p.strip()]


@router.get("", response_model=list[DocumentListItem])
def list_documents(
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
    q: str | None = None,
    status_filter: str | None = None,
) -> list[DocumentListItem]:
    query = db.query(Document)
    if q:
        like = f"%{q}%"
        query = query.filter((Document.title.ilike(like)) | (Document.reg_number.ilike(like)))
    if status_filter:
        query = query.filter(Document.status == status_filter)
    docs = query.order_by(Document.created_at.desc()).limit(200).all()
    return [DocumentListItem.model_validate(d) for d in docs]


@router.post("", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
def create_document(
    title: Annotated[str, Form()],
    doc_type: Annotated[str, Form()] = "generic",
    reg_number: Annotated[str | None, Form()] = None,
    approvers: Annotated[str, Form()] = "",
    file: Annotated[UploadFile | None, File()] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DocumentOut:
    doc = Document(
        title=title,
        doc_type=doc_type,
        reg_number=reg_number,
        status=DocumentStatus.draft,
        created_by_user_id=current_user.id,
    )
    db.add(doc)
    db.flush()  # assign doc.id

    approver_usernames = _parse_approvers(approvers)
    if approver_usernames:
        for idx, username in enumerate(approver_usernames, start=1):
            u = db.query(User).filter(User.username == username).one_or_none()
            if not u:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Approver '{username}' not found",
                )
            db.add(
                ApprovalStep(
                    document_id=doc.id,
                    step_order=idx,
                    approver_user_id=u.id,
                    state=StepState.pending,
                )
            )
        doc.status = DocumentStatus.in_review

    if file:
        storage_path, size = save_version_file(doc_id=doc.id, version=1, upload=file)
        db.add(
            DocumentVersion(
                document_id=doc.id,
                version=1,
                filename=file.filename or "file",
                content_type=file.content_type,
                size=size,
                storage_path=storage_path,
                uploaded_by_user_id=current_user.id,
            )
        )

    audit(db, actor=current_user, action="document.create", document_id=doc.id)

    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Document with same (doc_type, reg_number) already exists",
        ) from e

    db.refresh(doc)
    return DocumentOut.model_validate(doc)


@router.get("/{doc_id}", response_model=DocumentOut)
def get_document(
    doc_id: int,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> DocumentOut:
    doc = db.query(Document).filter(Document.id == doc_id).one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return DocumentOut.model_validate(doc)


@router.post("/{doc_id}/versions", response_model=DocumentOut)
def upload_new_version(
    doc_id: int,
    file: Annotated[UploadFile, File(...)],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DocumentOut:
    doc = db.query(Document).filter(Document.id == doc_id).one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    last_version = (
        db.query(DocumentVersion.version)
        .filter(DocumentVersion.document_id == doc_id)
        .order_by(DocumentVersion.version.desc())
        .limit(1)
        .scalar()
    )
    next_version = int(last_version or 0) + 1

    storage_path, size = save_version_file(doc_id=doc.id, version=next_version, upload=file)
    db.add(
        DocumentVersion(
            document_id=doc.id,
            version=next_version,
            filename=file.filename or "file",
            content_type=file.content_type,
            size=size,
            storage_path=storage_path,
            uploaded_by_user_id=current_user.id,
        )
    )
    audit(db, actor=current_user, action="document.version.upload", document_id=doc.id, meta={"version": next_version})
    db.commit()
    db.refresh(doc)
    return DocumentOut.model_validate(doc)


@router.get("/{doc_id}/versions/{version_id}/download")
def download_version(
    doc_id: int,
    version_id: int,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    v = (
        db.query(DocumentVersion)
        .filter(DocumentVersion.id == version_id, DocumentVersion.document_id == doc_id)
        .one_or_none()
    )
    if not v:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    path = resolve_storage_path(v.storage_path)
    return FileResponse(path, filename=v.filename, media_type=v.content_type or "application/octet-stream")


@router.post("/{doc_id}/approve", response_model=DocumentOut)
def approve(
    doc_id: int,
    comment: Annotated[str | None, Form()] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DocumentOut:
    doc = db.query(Document).filter(Document.id == doc_id).one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    step = actionable_step(doc)
    if not step or step.approver_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No actionable step for this user")

    step.state = StepState.approved
    step.comment = comment
    audit(db, actor=current_user, action="document.step.approve", document_id=doc.id, meta={"step_order": step.step_order})
    recompute_document_status(db, doc)
    db.commit()
    db.refresh(doc)
    return DocumentOut.model_validate(doc)


@router.post("/{doc_id}/reject", response_model=DocumentOut)
def reject(
    doc_id: int,
    comment: Annotated[str | None, Form()] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DocumentOut:
    doc = db.query(Document).filter(Document.id == doc_id).one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    step = actionable_step(doc)
    if not step or step.approver_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No actionable step for this user")

    step.state = StepState.rejected
    step.comment = comment
    audit(db, actor=current_user, action="document.step.reject", document_id=doc.id, meta={"step_order": step.step_order})
    recompute_document_status(db, doc)
    db.commit()
    db.refresh(doc)
    return DocumentOut.model_validate(doc)
