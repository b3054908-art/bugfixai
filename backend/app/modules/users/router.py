"""Mirrors: backend/src/modules/users/user.routes.ts"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.middleware.auth import AuthUser, require_auth
from app.db.session import get_db
from app.modules.users.schemas import MeResponse, UserProfile
from app.modules.users.service import get_user

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=MeResponse)
async def me(
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    user = await get_user(db, current_user.id)
    return MeResponse(user=UserProfile.model_validate(user))
