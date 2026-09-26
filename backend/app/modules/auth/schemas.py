"""Mirrors: backend/src/modules/auth/auth.controller.ts (zod schemas)"""
from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    # Length is checked manually in the service layer (not here) so we can
    # raise the same WEAK_PASSWORD AppError code the Node version used,
    # instead of a generic 422 validation error.
    password: str
    displayName: str = Field(min_length=1, max_length=80)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class UserPublic(BaseModel):
    id: str
    email: str
    displayName: str
    role: str

    model_config = {"from_attributes": True}


class RegisterResponse(BaseModel):
    user: UserPublic


class LoginResponse(BaseModel):
    user: UserPublic
    token: str


class MeResponse(BaseModel):
    user: UserPublic
