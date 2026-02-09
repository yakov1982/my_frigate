from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
from jose import jwt

from lexima_dms.app_core.config import get_settings

_BCRYPT_ROUNDS = 12


def hash_password(password: str) -> str:
    pw = password.encode("utf-8")
    # bcrypt has a 72-byte password limit; pre-hash only when needed
    if len(pw) > 72:
        pw = hashlib.sha256(pw).digest()
    salt = bcrypt.gensalt(rounds=_BCRYPT_ROUNDS)
    return bcrypt.hashpw(pw, salt).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    pw = password.encode("utf-8")
    if len(pw) > 72:
        pw = hashlib.sha256(pw).digest()
    return bcrypt.checkpw(pw, password_hash.encode("utf-8"))


def create_access_token(*, subject: str, extra: dict[str, Any] | None = None) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.jwt_expires_minutes)
    payload: dict[str, Any] = {"sub": subject, "iat": int(now.timestamp()), "exp": int(expire.timestamp())}
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_alg)

