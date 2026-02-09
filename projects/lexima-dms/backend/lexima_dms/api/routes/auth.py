from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from lexima_dms.api.deps import get_current_user, get_db
from lexima_dms.api.schemas import Token, UserOut
from lexima_dms.core.security import create_access_token, verify_password
from lexima_dms.db.models import User

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/token", response_model=Token)
def token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)) -> Token:
    user = db.query(User).filter(User.username == form_data.username).one_or_none()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Incorrect username or password")

    access_token = create_access_token(subject=user.username, extra={"uid": user.id, "role": user.role.value})
    return Token(access_token=access_token)


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(current_user)

