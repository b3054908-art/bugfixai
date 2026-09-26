"""New module — no Node/TS counterpart.

User-level settings: which AI provider/model is active for copilot chat,
plus a few automation preferences. Backed by the UserSetting table, which
already existed in the schema (created by the initial migration) but had
no API surface until now.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.errors.app_error import AppError
from app.models.enums import Provider
from app.models.settings import UserSetting

# Free-tier default for brand-new users: no card, no signup friction, works the
# moment a GROQ_API_KEY is dropped into the server .env. New users default here
# unconditionally — even before a key is added — because if nothing at all is
# configured yet, the failure a user should be pointed at is "add a free Groq
# key" rather than "add a paid OpenAI key" (settings.DEFAULT_AI_PROVIDER).
_FREE_DEFAULT_PROVIDER = Provider.groq
_FREE_DEFAULT_MODEL = "llama-3.3-70b-versatile"


async def get_or_create_settings(db: AsyncSession, user_id: str) -> UserSetting:
    stmt = select(UserSetting).where(UserSetting.userId == user_id)
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is not None:
        return row
    row = UserSetting(userId=user_id, primaryProvider=_FREE_DEFAULT_PROVIDER, primaryModel=_FREE_DEFAULT_MODEL)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def update_settings(
    db: AsyncSession,
    user_id: str,
    provider: str | None,
    model: str | None,
    auto_run_tests: bool | None = None,
    minimum_confidence: int | None = None,
    sandbox_guardrails: bool | None = None,
) -> UserSetting:
    row = await get_or_create_settings(db, user_id)

    if provider is not None:
        try:
            row.primaryProvider = Provider(provider)
        except ValueError:
            raise AppError(400, "INVALID_PROVIDER", f"Unknown provider: {provider}")

    if model is not None:
        if not model.strip():
            raise AppError(400, "INVALID_MODEL", "Model cannot be empty")
        row.primaryModel = model.strip()

    if auto_run_tests is not None:
        row.autoRunTests = auto_run_tests

    if minimum_confidence is not None:
        if not (0 <= minimum_confidence <= 100):
            raise AppError(400, "INVALID_CONFIDENCE", "minimumConfidence must be between 0 and 100")
        row.minimumConfidence = minimum_confidence

    if sandbox_guardrails is not None:
        row.sandboxGuardrails = sandbox_guardrails

    await db.commit()
    await db.refresh(row)
    return row