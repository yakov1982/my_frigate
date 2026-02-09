from __future__ import annotations

from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from lexima_dms.app_core.config import get_settings
from lexima_dms.db.models import User
from lexima_dms.db.session import db_session

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")


def get_db() -> Session:
    db = db_session()
    try:
        yield db
    finally:
        db.close()


def get_current_user(db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)) -> User:
    settings = get_settings()
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_alg])
        username: str | None = payload.get("sub")
        if not username:
            raise credentials_exc
    except JWTError as e:
        raise credentials_exc from e

    user = db.query(User).filter(User.username == username).one_or_none()
    if not user:
        raise credentials_exc
    return user

