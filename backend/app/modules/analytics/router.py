from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.middleware.auth import AuthUser, require_auth
from app.db.session import get_db
from app.modules.analytics.service import clear_project_tests, get_project_analytics

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("")
async def analytics(
    project_id: str = Query(..., alias="projectId"),
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    return await get_project_analytics(db, current_user.id, project_id)


@router.delete("")
async def clear(
    project_id: str = Query(..., alias="projectId"),
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    count = await clear_project_tests(db, current_user.id, project_id)
    return {"deleted": count}