"""System health check API endpoints."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse

from frigate.api.auth import allow_any_authenticated
from frigate.api.defs.tags import Tags
from frigate.util.health_check import (
    HealthStatus,
    check_config_directory,
    check_database,
    check_ffmpeg,
    check_shm,
    check_storage,
    check_tmp_cache,
    run_all_health_checks,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=[Tags.app])


@router.get(
    "/system/health",
    dependencies=[Depends(allow_any_authenticated())],
    summary="System health check",
    description="""Runs comprehensive system health checks including storage,
    database, shared memory, ffmpeg, and cache status.
    Returns overall status and individual check results.
    """,
)
def system_health():
    """Run all system health checks and return a report."""
    report = run_all_health_checks()
    result = report.to_dict()

    # Use appropriate HTTP status based on overall health
    if report.overall_status == HealthStatus.ERROR:
        status_code = 503
    elif report.overall_status == HealthStatus.WARNING:
        status_code = 200
    else:
        status_code = 200

    return JSONResponse(content=result, status_code=status_code)


@router.get(
    "/system/health/storage",
    dependencies=[Depends(allow_any_authenticated())],
    summary="Storage health check",
    description="Check storage usage for media, recordings, clips, and exports.",
)
def storage_health(
    warn_threshold: float = Query(
        default=85.0,
        description="Percentage used that triggers a warning",
        ge=0,
        le=100,
    ),
    error_threshold: float = Query(
        default=95.0,
        description="Percentage used that triggers an error",
        ge=0,
        le=100,
    ),
):
    """Check storage health with configurable thresholds."""
    from frigate.const import BASE_DIR, CLIPS_DIR, EXPORT_DIR, RECORD_DIR

    checks = [
        check_storage(BASE_DIR, "media", warn_threshold, error_threshold),
        check_storage(RECORD_DIR, "recordings", warn_threshold, error_threshold),
        check_storage(CLIPS_DIR, "clips", warn_threshold, error_threshold),
        check_storage(EXPORT_DIR, "exports", warn_threshold, error_threshold),
    ]

    results = [c.to_dict() for c in checks]
    has_error = any(c.status == HealthStatus.ERROR for c in checks)

    return JSONResponse(
        content={"checks": results},
        status_code=503 if has_error else 200,
    )


@router.get(
    "/system/health/database",
    dependencies=[Depends(allow_any_authenticated())],
    summary="Database health check",
    description="Check database file accessibility and WAL status.",
)
def database_health():
    """Check database health."""
    result = check_database()
    status_code = 503 if result.status == HealthStatus.ERROR else 200
    return JSONResponse(content=result.to_dict(), status_code=status_code)
