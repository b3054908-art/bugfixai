"""Mirrors: backend/src/modules/ai/model-router.ts"""
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.settings import AIModelConfig, UserSetting


@dataclass
class ResolvedModel:
    provider: str
    model: str
    config: AIModelConfig | None


async def resolve_model(
    db: AsyncSession,
    requested_provider: str | None,
    requested_model: str | None,
    user_id: str | None = None,
) -> ResolvedModel:
    provider = requested_provider or settings.DEFAULT_AI_PROVIDER
    model = requested_model or settings.DEFAULT_AI_MODEL
    if user_id and (requested_provider is None or requested_model is None):
        user_setting = (
            await db.execute(select(UserSetting).where(UserSetting.userId == user_id))
        ).scalar_one_or_none()
        if user_setting:
            provider = requested_provider or user_setting.primaryProvider.value
            model = requested_model or user_setting.primaryModel
    config = (
        await db.execute(select(AIModelConfig).where(AIModelConfig.modelId == model))
    ).scalar_one_or_none()
    return ResolvedModel(provider=provider, model=model, config=config)
