"""Mirrors: backend/src/modules/uploads/upload.routes.ts + upload.controller.ts"""
import os
import shutil
import tempfile

from fastapi import APIRouter, Depends, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.errors.app_error import AppError
from app.common.middleware.auth import AuthUser, require_auth
from app.db.session import get_db
from app.modules.projects.service import get_project
from app.modules.uploads.service import store_project_archive

router = APIRouter(prefix="/projects", tags=["uploads"])

ALLOWED_EXTENSIONS = {".zip", ".tar", ".gz", ".tgz"}
_UPLOAD_TMP_DIR = os.path.join(tempfile.gettempdir(), "bugfixai-uploads")


@router.post("/{project_id}/upload", status_code=201)
async def upload(
    project_id: str,
    file: UploadFile,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    project = await get_project(db, current_user.id, project_id)  # 404s if not owned by the user
    if project.workspace is None:
        raise AppError(409, "WORKSPACE_MISSING", "This project has no workspace to extract into")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise AppError(400, "FILE_REQUIRED", "A project archive is required")

    os.makedirs(_UPLOAD_TMP_DIR, exist_ok=True)
    tmp_path = os.path.join(_UPLOAD_TMP_DIR, f"{os.urandom(8).hex()}{ext}")
    try:
        from app.core.config import settings as _settings

        written = 0
        with open(tmp_path, "wb") as out:
            while chunk := await file.read(1024 * 1024):
                written += len(chunk)
                if written > _settings.MAX_UPLOAD_BYTES:
                    raise AppError(413, "FILE_TOO_LARGE", "Uploaded archive exceeds the configured limit")
                out.write(chunk)
        result = await store_project_archive(db, project_id, tmp_path, file.filename or "archive", project.workspace.rootPath)
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    return {"projectId": project_id, **result}
