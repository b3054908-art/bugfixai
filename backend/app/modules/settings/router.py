"""New module — no Node/TS counterpart."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.middleware.auth import AuthUser, require_auth
from app.db.session import get_db
from app.modules.settings.schemas import SettingsOut, UpdateSettingsRequest
from app.modules.settings.service import get_or_create_settings, update_settings

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/me", response_model=SettingsOut)
async def get_my_settings(
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    row = await get_or_create_settings(db, current_user.id)
    return SettingsOut.model_validate(row)


@router.put("/me", response_model=SettingsOut)
async def update_my_settings(
    payload: UpdateSettingsRequest,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    row = await update_settings(
        db,
        current_user.id,
        payload.primaryProvider,
        payload.primaryModel,
        payload.autoRunTests,
        payload.minimumConfidence,
        payload.sandboxGuardrails,
    )
    return SettingsOut.model_validate(row)
