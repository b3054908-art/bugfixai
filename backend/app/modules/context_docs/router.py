"""Mirrors the pattern in modules/uploads/router.py, scoped to context docs."""
import os
import tempfile

from fastapi import APIRouter, Depends, Form, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.middleware.auth import AuthUser, require_auth
from app.common.errors.app_error import AppError
from app.core.config import settings
from app.db.session import get_db
from app.modules.context_docs.service import (
    delete_context_doc,
    list_context_docs,
    store_context_doc,
)
from app.modules.projects.service import get_project

router = APIRouter(prefix="/projects", tags=["context-docs"])

_UPLOAD_TMP_DIR = os.path.join(tempfile.gettempdir(), "bugfixai-context-docs")


@router.post("/{project_id}/context-docs", status_code=201)
async def upload_context_doc(
    project_id: str,
    file: UploadFile,
    description: str | None = Form(None),
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    await get_project(db, current_user.id, project_id)  # 404s if not owned by the user

    os.makedirs(_UPLOAD_TMP_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1].lower()
    tmp_path = os.path.join(_UPLOAD_TMP_DIR, f"{os.urandom(8).hex()}{ext}")
    try:
        written = 0
        with open(tmp_path, "wb") as out:
            while chunk := await file.read(1024 * 1024):
                written += len(chunk)
                if written > settings.MAX_UPLOAD_BYTES:
                    raise AppError(413, "FILE_TOO_LARGE", "Context doc exceeds the configured limit")
                out.write(chunk)
        return await store_context_doc(db, project_id, tmp_path, file.filename or "context-doc", description)
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@router.get("/{project_id}/context-docs")
async def get_context_docs(
    project_id: str,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    await get_project(db, current_user.id, project_id)
    return await list_context_docs(db, project_id)


@router.delete("/{project_id}/context-docs/{doc_id}", status_code=204)
async def remove_context_doc(
    project_id: str,
    doc_id: str,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    await get_project(db, current_user.id, project_id)
    await delete_context_doc(db, project_id, doc_id)
