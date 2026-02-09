from __future__ import annotations

import re
from pathlib import Path

from fastapi import UploadFile

from lexima_dms.app_core.config import get_settings


_FILENAME_SAFE_RE = re.compile(r"[^A-Za-z0-9А-Яа-я._ -]+")


def _safe_filename(name: str) -> str:
    name = name.strip().replace("/", "_").replace("\\", "_")
    name = _FILENAME_SAFE_RE.sub("_", name)
    return name or "file"


def doc_files_dir(doc_id: int) -> Path:
    settings = get_settings()
    p = settings.data_dir / "files" / str(doc_id)
    p.mkdir(parents=True, exist_ok=True)
    return p


def save_version_file(*, doc_id: int, version: int, upload: UploadFile) -> tuple[str, int]:
    """
    Saves upload to data dir and returns (storage_path, size_bytes).
    storage_path is a relative path inside data_dir.
    """
    base_dir = doc_files_dir(doc_id)
    filename = _safe_filename(upload.filename or f"document_{doc_id}")
    out_name = f"v{version}_{filename}"
    out_path = base_dir / out_name

    size = 0
    with out_path.open("wb") as f:
        while True:
            chunk = upload.file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            f.write(chunk)

    settings = get_settings()
    rel = out_path.relative_to(settings.data_dir)
    return str(rel), size


def resolve_storage_path(storage_path: str) -> Path:
    settings = get_settings()
    p = (settings.data_dir / storage_path).resolve()
    # basic safety: ensure path stays inside data_dir
    if settings.data_dir.resolve() not in p.parents and p != settings.data_dir.resolve():
        raise ValueError("Invalid storage path")
    return p

