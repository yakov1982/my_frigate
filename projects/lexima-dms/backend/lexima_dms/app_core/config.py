from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="LEXIMA_DMS_",
        env_file=".env",
        extra="ignore",
    )

    data_dir: Path = Path("./data")

    jwt_secret: str = "dev-secret"
    jwt_alg: str = "HS256"
    jwt_expires_minutes: int = 12 * 60

    def ensure_dirs(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        (self.data_dir / "files").mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    s.ensure_dirs()
    return s

