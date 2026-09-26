"""Mirrors: backend/src/modules/auth/auth.service.ts + auth.repository.ts"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.errors.app_error import AppError
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User
from app.modules.auth.schemas import LoginRequest, RegisterRequest


async def find_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def register_user(db: AsyncSession, payload: RegisterRequest) -> User:
    email = payload.email.strip().lower()

    if len(payload.password) < 12:
        raise AppError(400, "WEAK_PASSWORD", "Password must contain at least 12 characters")

    existing = await find_by_email(db, email)
    if existing is not None:
        raise AppError(409, "EMAIL_EXISTS", "An account already exists for this email")

    user = User(
        email=email,
        passwordHash=hash_password(payload.password),
        displayName=payload.displayName.strip(),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def login_user(db: AsyncSession, payload: LoginRequest) -> tuple[User, str]:
    user = await find_by_email(db, payload.email.strip().lower())
    if user is None or not verify_password(payload.password, user.passwordHash):
        raise AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect")

    token_payload = {
        "id": user.id,
        "email": user.email,
        "displayName": user.displayName,
        "role": user.role.value,
    }
    token = create_access_token(token_payload)
    return user, token
