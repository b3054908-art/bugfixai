"""New module — no Node/TS counterpart."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.middleware.auth import AuthUser, require_auth
from app.db.session import get_db
from app.modules.credentials.schemas import (
    CredentialStatus,
    ModelsResponse,
    ProviderUsageOut,
    SaveCredentialRequest,
    SaveCredentialResponse,
)
from app.modules.credentials.service import (
    delete_credential,
    get_models_for_user_provider,
    get_usage_for_all_providers,
    get_usage_for_provider,
    list_credential_status,
    validate_and_save_credential,
)

router = APIRouter(prefix="/credentials", tags=["credentials"])


@router.get("", response_model=list[CredentialStatus])
async def get_credential_status(
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    return await list_credential_status(db, current_user.id)


@router.post("", response_model=SaveCredentialResponse)
async def save_credential(
    payload: SaveCredentialRequest,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    models = await validate_and_save_credential(
        db, current_user.id, payload.provider, payload.apiKey, payload.baseUrl
    )
    return SaveCredentialResponse(provider=payload.provider, models=models)


@router.delete("/{provider}")
async def remove_credential(
    provider: str,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    await delete_credential(db, current_user.id, provider)
    return {"success": True}


@router.get("/{provider}/models", response_model=ModelsResponse)
async def get_provider_models(
    provider: str,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    configured, models = await get_models_for_user_provider(db, current_user.id, provider)
    return ModelsResponse(provider=provider, configured=configured, models=models)


@router.get("/usage/all", response_model=list[ProviderUsageOut])
async def get_all_provider_usage(
    current_user: AuthUser = Depends(require_auth),
):
    """Powers the top-bar quota badge - one call covers every provider so the
    IDE shell doesn't need a request per provider just to render a dot."""
    return await get_usage_for_all_providers(current_user.id)


@router.get("/{provider}/usage", response_model=ProviderUsageOut)
async def get_provider_usage(
    provider: str,
    current_user: AuthUser = Depends(require_auth),
):
    return await get_usage_for_provider(current_user.id, provider)
