"""Mirrors: backend/src/modules/users/user.service.ts + user.repository.ts"""
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.errors.app_error import AppError
from app.models.user import User


async def get_user(db: AsyncSession, user_id: str) -> User:
    user = await db.get(User, user_id)
    if user is None:
        raise AppError(404, "USER_NOT_FOUND", "User was not found")
    return user
