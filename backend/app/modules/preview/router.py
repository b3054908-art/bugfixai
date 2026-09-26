from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.middleware.auth import AuthUser, require_auth
from app.db.session import get_db
from app.modules.preview.schemas import PreviewStartResponse, PreviewStateResponse
from app.modules.preview.service import get_preview_state, start_preview, stop_preview

router = APIRouter(prefix="/projects", tags=["preview"])


@router.get("/{project_id}/preview/state", response_model=PreviewStateResponse)
async def state(
    project_id: str,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    result = await get_preview_state(db, current_user.id, project_id)
    return PreviewStateResponse(**result)


@router.post("/{project_id}/preview/start", response_model=PreviewStartResponse)
async def start(
    project_id: str,
    build: Literal["original", "patched"] = Query("patched"),
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    result = await start_preview(db, current_user.id, project_id, build)
    return PreviewStartResponse(**result)


@router.post("/{project_id}/preview/stop", status_code=204)
async def stop(
    project_id: str,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    await stop_preview(db, current_user.id, project_id)
