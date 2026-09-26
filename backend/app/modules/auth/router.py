"""Mirrors: backend/src/modules/auth/auth.routes.ts"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.middleware.auth import AuthUser, require_auth
from app.db.session import get_db
from app.modules.auth.schemas import (
    LoginRequest,
    LoginResponse,
    MeResponse,
    RegisterRequest,
    RegisterResponse,
    UserPublic,
)
from app.modules.auth.service import login_user, register_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=RegisterResponse, status_code=201)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)):
    user = await register_user(db, payload)
    return RegisterResponse(
        user=UserPublic(id=user.id, email=user.email, displayName=user.displayName, role=user.role.value)
    )


@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    user, token = await login_user(db, payload)
    return LoginResponse(
        user=UserPublic(id=user.id, email=user.email, displayName=user.displayName, role=user.role.value),
        token=token,
    )


@router.get("/me", response_model=MeResponse)
async def me(current_user: AuthUser = Depends(require_auth)):
    return MeResponse(
        user=UserPublic(
            id=current_user.id,
            email=current_user.email,
            displayName=current_user.displayName,
            role=current_user.role,
        )
    )
