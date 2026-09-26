"""Mirrors: backend/src/config/storage.ts"""
import os

from app.core.config import settings


def ensure_storage_directories() -> None:
    os.makedirs(settings.STORAGE_ROOT, exist_ok=True, mode=0o750)
    os.makedirs(settings.SANDBOX_WORK_ROOT, exist_ok=True, mode=0o750)


def project_storage_path(project_id: str) -> str:
    return os.path.join(settings.STORAGE_ROOT, "projects", project_id)
