"""System health check utilities for Frigate."""

import logging
import os
import shutil
import subprocess as sp
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional

from frigate.const import (
    BASE_DIR,
    CACHE_DIR,
    CLIPS_DIR,
    CONFIG_DIR,
    DEFAULT_DB_PATH,
    EXPORT_DIR,
    RECORD_DIR,
)

logger = logging.getLogger(__name__)


class HealthStatus(str, Enum):
    """Health check status levels."""

    HEALTHY = "healthy"
    WARNING = "warning"
    ERROR = "error"


@dataclass
class HealthCheckResult:
    """Result of a single health check."""

    name: str
    status: HealthStatus
    message: str
    details: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        result = {
            "name": self.name,
            "status": self.status.value,
            "message": self.message,
        }
        if self.details:
            result["details"] = self.details
        return result


@dataclass
class SystemHealthReport:
    """Aggregated system health report."""

    overall_status: HealthStatus
    checks: list[HealthCheckResult]

    def to_dict(self) -> dict[str, Any]:
        return {
            "overall_status": self.overall_status.value,
            "checks": [check.to_dict() for check in self.checks],
        }


def check_storage(
    path: str, name: str, warn_threshold_pct: float = 85.0, error_threshold_pct: float = 95.0
) -> HealthCheckResult:
    """Check storage usage for a given path.

    Args:
        path: Filesystem path to check.
        name: Human-readable name of the storage location.
        warn_threshold_pct: Percentage used that triggers a warning.
        error_threshold_pct: Percentage used that triggers an error.
    """
    if not os.path.exists(path):
        return HealthCheckResult(
            name=f"storage_{name}",
            status=HealthStatus.WARNING,
            message=f"Path {path} does not exist",
        )

    try:
        usage = shutil.disk_usage(path)
        total_gb = round(usage.total / (1024**3), 2)
        used_gb = round(usage.used / (1024**3), 2)
        free_gb = round(usage.free / (1024**3), 2)
        used_pct = round((usage.used / usage.total) * 100, 1) if usage.total > 0 else 0

        details = {
            "path": path,
            "total_gb": total_gb,
            "used_gb": used_gb,
            "free_gb": free_gb,
            "used_percent": used_pct,
        }

        if used_pct >= error_threshold_pct:
            return HealthCheckResult(
                name=f"storage_{name}",
                status=HealthStatus.ERROR,
                message=f"Storage critically full: {used_pct}% used ({free_gb} GB free)",
                details=details,
            )
        elif used_pct >= warn_threshold_pct:
            return HealthCheckResult(
                name=f"storage_{name}",
                status=HealthStatus.WARNING,
                message=f"Storage usage high: {used_pct}% used ({free_gb} GB free)",
                details=details,
            )
        else:
            return HealthCheckResult(
                name=f"storage_{name}",
                status=HealthStatus.HEALTHY,
                message=f"Storage OK: {used_pct}% used ({free_gb} GB free)",
                details=details,
            )
    except OSError as e:
        return HealthCheckResult(
            name=f"storage_{name}",
            status=HealthStatus.ERROR,
            message=f"Unable to check storage: {e}",
        )


def check_shm() -> HealthCheckResult:
    """Check shared memory (/dev/shm) availability and usage."""
    shm_path = "/dev/shm"

    if not os.path.exists(shm_path):
        return HealthCheckResult(
            name="shared_memory",
            status=HealthStatus.WARNING,
            message="/dev/shm not available",
        )

    try:
        usage = shutil.disk_usage(shm_path)
        total_mb = round(usage.total / (1024**2), 1)
        used_mb = round(usage.used / (1024**2), 1)
        free_mb = round(usage.free / (1024**2), 1)
        used_pct = round((usage.used / usage.total) * 100, 1) if usage.total > 0 else 0

        details = {
            "total_mb": total_mb,
            "used_mb": used_mb,
            "free_mb": free_mb,
            "used_percent": used_pct,
        }

        if used_pct >= 90:
            return HealthCheckResult(
                name="shared_memory",
                status=HealthStatus.ERROR,
                message=f"Shared memory critically low: {free_mb} MB free ({used_pct}% used)",
                details=details,
            )
        elif used_pct >= 70:
            return HealthCheckResult(
                name="shared_memory",
                status=HealthStatus.WARNING,
                message=f"Shared memory usage high: {free_mb} MB free ({used_pct}% used)",
                details=details,
            )
        else:
            return HealthCheckResult(
                name="shared_memory",
                status=HealthStatus.HEALTHY,
                message=f"Shared memory OK: {free_mb} MB free of {total_mb} MB total",
                details=details,
            )
    except OSError as e:
        return HealthCheckResult(
            name="shared_memory",
            status=HealthStatus.ERROR,
            message=f"Unable to check shared memory: {e}",
        )


def check_database() -> HealthCheckResult:
    """Check if the database file exists and is accessible."""
    db_path = DEFAULT_DB_PATH

    if not os.path.exists(db_path):
        return HealthCheckResult(
            name="database",
            status=HealthStatus.WARNING,
            message=f"Database not found at {db_path} (may not be initialized yet)",
        )

    try:
        db_size_mb = round(os.path.getsize(db_path) / (1024**2), 2)
        is_readable = os.access(db_path, os.R_OK)
        is_writable = os.access(db_path, os.W_OK)

        details = {
            "path": db_path,
            "size_mb": db_size_mb,
            "readable": is_readable,
            "writable": is_writable,
        }

        # Check for WAL file
        wal_path = f"{db_path}-wal"
        if os.path.exists(wal_path):
            wal_size_mb = round(os.path.getsize(wal_path) / (1024**2), 2)
            details["wal_size_mb"] = wal_size_mb

            if wal_size_mb > 100:
                return HealthCheckResult(
                    name="database",
                    status=HealthStatus.WARNING,
                    message=f"WAL file is large ({wal_size_mb} MB), checkpoint may be needed",
                    details=details,
                )

        if not is_writable:
            return HealthCheckResult(
                name="database",
                status=HealthStatus.ERROR,
                message="Database is not writable",
                details=details,
            )

        return HealthCheckResult(
            name="database",
            status=HealthStatus.HEALTHY,
            message=f"Database OK ({db_size_mb} MB)",
            details=details,
        )
    except OSError as e:
        return HealthCheckResult(
            name="database",
            status=HealthStatus.ERROR,
            message=f"Unable to check database: {e}",
        )


def check_ffmpeg() -> HealthCheckResult:
    """Check if ffmpeg is available and working."""
    try:
        result = sp.run(
            ["ffmpeg", "-version"],
            capture_output=True,
            text=True,
            timeout=5,
        )

        if result.returncode == 0:
            version_line = result.stdout.split("\n")[0] if result.stdout else "unknown"
            return HealthCheckResult(
                name="ffmpeg",
                status=HealthStatus.HEALTHY,
                message=f"FFmpeg available: {version_line}",
                details={"version": version_line},
            )
        else:
            return HealthCheckResult(
                name="ffmpeg",
                status=HealthStatus.ERROR,
                message=f"FFmpeg returned error: {result.stderr[:200]}",
            )
    except FileNotFoundError:
        return HealthCheckResult(
            name="ffmpeg",
            status=HealthStatus.ERROR,
            message="FFmpeg not found in system PATH",
        )
    except sp.TimeoutExpired:
        return HealthCheckResult(
            name="ffmpeg",
            status=HealthStatus.WARNING,
            message="FFmpeg version check timed out",
        )
    except Exception as e:
        return HealthCheckResult(
            name="ffmpeg",
            status=HealthStatus.ERROR,
            message=f"Unable to check FFmpeg: {e}",
        )


def check_tmp_cache() -> HealthCheckResult:
    """Check the tmp cache directory status."""
    if not os.path.exists(CACHE_DIR):
        return HealthCheckResult(
            name="tmp_cache",
            status=HealthStatus.WARNING,
            message=f"Cache directory {CACHE_DIR} does not exist",
        )

    try:
        usage = shutil.disk_usage(CACHE_DIR)
        total_mb = round(usage.total / (1024**2), 1)
        free_mb = round(usage.free / (1024**2), 1)
        used_pct = round((usage.used / usage.total) * 100, 1) if usage.total > 0 else 0

        # Count files in cache
        cache_files = 0
        cache_size_mb = 0.0
        try:
            for entry in os.scandir(CACHE_DIR):
                if entry.is_file():
                    cache_files += 1
                    cache_size_mb += entry.stat().st_size / (1024**2)
        except PermissionError:
            pass

        cache_size_mb = round(cache_size_mb, 2)

        details = {
            "path": CACHE_DIR,
            "total_mb": total_mb,
            "free_mb": free_mb,
            "used_percent": used_pct,
            "cache_files": cache_files,
            "cache_size_mb": cache_size_mb,
        }

        if used_pct >= 90:
            return HealthCheckResult(
                name="tmp_cache",
                status=HealthStatus.ERROR,
                message=f"Cache storage critically full: {used_pct}% used",
                details=details,
            )
        elif used_pct >= 75:
            return HealthCheckResult(
                name="tmp_cache",
                status=HealthStatus.WARNING,
                message=f"Cache storage usage high: {used_pct}% used",
                details=details,
            )
        else:
            return HealthCheckResult(
                name="tmp_cache",
                status=HealthStatus.HEALTHY,
                message=f"Cache OK: {cache_files} files, {cache_size_mb} MB used",
                details=details,
            )
    except OSError as e:
        return HealthCheckResult(
            name="tmp_cache",
            status=HealthStatus.ERROR,
            message=f"Unable to check cache: {e}",
        )


def check_config_directory() -> HealthCheckResult:
    """Check the config directory accessibility."""
    if not os.path.exists(CONFIG_DIR):
        return HealthCheckResult(
            name="config_directory",
            status=HealthStatus.ERROR,
            message=f"Config directory {CONFIG_DIR} does not exist",
        )

    is_readable = os.access(CONFIG_DIR, os.R_OK)
    is_writable = os.access(CONFIG_DIR, os.W_OK)

    details = {
        "path": CONFIG_DIR,
        "readable": is_readable,
        "writable": is_writable,
    }

    if not is_readable:
        return HealthCheckResult(
            name="config_directory",
            status=HealthStatus.ERROR,
            message="Config directory is not readable",
            details=details,
        )

    if not is_writable:
        return HealthCheckResult(
            name="config_directory",
            status=HealthStatus.WARNING,
            message="Config directory is not writable",
            details=details,
        )

    return HealthCheckResult(
        name="config_directory",
        status=HealthStatus.HEALTHY,
        message="Config directory accessible",
        details=details,
    )


def run_all_health_checks() -> SystemHealthReport:
    """Run all health checks and return an aggregated report.

    Returns:
        SystemHealthReport with overall status and individual check results.
    """
    checks: list[HealthCheckResult] = []

    # Storage checks
    checks.append(check_storage(BASE_DIR, "media"))
    checks.append(check_storage(RECORD_DIR, "recordings"))
    checks.append(check_storage(CLIPS_DIR, "clips"))
    checks.append(check_storage(EXPORT_DIR, "exports"))

    # System checks
    checks.append(check_shm())
    checks.append(check_database())
    checks.append(check_ffmpeg())
    checks.append(check_tmp_cache())
    checks.append(check_config_directory())

    # Determine overall status
    statuses = [check.status for check in checks]

    if HealthStatus.ERROR in statuses:
        overall = HealthStatus.ERROR
    elif HealthStatus.WARNING in statuses:
        overall = HealthStatus.WARNING
    else:
        overall = HealthStatus.HEALTHY

    return SystemHealthReport(overall_status=overall, checks=checks)
