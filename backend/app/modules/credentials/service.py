"""New module — no Node/TS counterpart.

Lets a user bring their own API key for any supported provider. A key is
validated by actually calling that provider's model-listing endpoint (never
just checking the string looks key-shaped), then stored encrypted in
ProviderCredential (same table already used by modules/ai/service.py, so a
saved key here is immediately used for real chat/diagnose calls too).

Also classifies each returned model as free or paid so the frontend can
render "Free Models" / "Paid Models" sections per provider.
"""
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.errors.app_error import AppError
from app.core.config import settings
from app.core.secret_crypto import decrypt_secret, encrypt_secret
from app.models.enums import Provider
from app.models.settings import ProviderCredential
from app.modules.credentials.schemas import CredentialStatus, ModelInfo, ModelUsageOut, ProviderUsageOut
from app.modules.ai.usage_tracking import ModelUsage, get_key_usage

_DEFAULT_BASE_URL = {
    Provider.openai: "https://api.openai.com/v1",
    Provider.anthropic: "https://api.anthropic.com",
    Provider.google: "https://generativelanguage.googleapis.com/v1beta",
    Provider.groq: "https://api.groq.com/openai/v1",
    Provider.openrouter: "https://openrouter.ai/api/v1",
    Provider.deepseek: "https://api.deepseek.com/v1",
    Provider.nvidia: "https://integrate.api.nvidia.com/v1",
}

# Mirrors modules/ai/service.py's _ENV_KEY_MAP — lets "no user key yet" still
# resolve to the server's own .env key, exactly like real chat calls do.
_ENV_KEY_MAP = {
    Provider.openai: lambda: settings.OPENAI_API_KEY,
    Provider.anthropic: lambda: settings.ANTHROPIC_API_KEY,
    Provider.google: lambda: settings.GOOGLE_API_KEY,
    Provider.groq: lambda: settings.GROQ_API_KEY,
    Provider.openrouter: lambda: settings.OPENROUTER_API_KEY,
    Provider.deepseek: lambda: settings.DEEPSEEK_API_KEY,
    Provider.nvidia: lambda: settings.NVIDIA_API_KEY,
}

# Providers this feature supports (excludes `custom` and `github`, which
# aren't chat-model providers with a standard /models endpoint).
SUPPORTED_PROVIDERS = [
    Provider.groq,
    Provider.openrouter,
    Provider.openai,
    Provider.anthropic,
    Provider.google,
    Provider.deepseek,
    Provider.nvidia,
]

_CHAT_EXCLUDE_HINTS = (
    "whisper", "tts", "audio", "embedding", "moderation", "dall-e",
    "image", "davinci", "babbage", "ada-", "curie", "realtime",
)


def _looks_like_chat_model(model_id: str) -> bool:
    lowered = model_id.lower()
    return not any(hint in lowered for hint in _CHAT_EXCLUDE_HINTS)


async def _fetch_openai_style_models(
    api_key: str, base_url: str, *, force_free: bool = False, force_paid: bool = False
) -> list[ModelInfo]:
    """Groq / DeepSeek / custom OpenAI-compatible endpoints: GET {base}/models."""
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(
            f"{base_url}/models",
            headers={"authorization": f"Bearer {api_key}"},
        )
    if resp.status_code in (401, 403):
        raise AppError(400, "INVALID_API_KEY", "That API key was rejected by the provider.")
    if resp.status_code >= 400:
        raise AppError(400, "PROVIDER_ERROR", f"Provider returned status {resp.status_code}.")

    data = resp.json().get("data", [])
    models: list[ModelInfo] = []
    for entry in data:
        model_id = entry.get("id")
        if not model_id or not _looks_like_chat_model(model_id):
            continue
        # Groq's /models response includes this; most other OpenAI-compatible
        # endpoints (OpenAI, DeepSeek, NVIDIA) don't, so this is None there.
        context_window = entry.get("context_window")
        models.append(ModelInfo(
            id=model_id,
            name=model_id,
            free=force_free and not force_paid,
            contextWindow=int(context_window) if isinstance(context_window, (int, float)) else None,
        ))
    models.sort(key=lambda m: m.id)
    return models


async def _fetch_openrouter_models(api_key: str, base_url: str) -> list[ModelInfo]:
    """OpenRouter exposes real per-model pricing, so free vs paid is exact."""
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(
            f"{base_url}/models",
            headers={"authorization": f"Bearer {api_key}"},
        )
    if resp.status_code in (401, 403):
        raise AppError(400, "INVALID_API_KEY", "That API key was rejected by OpenRouter.")
    if resp.status_code >= 400:
        raise AppError(400, "PROVIDER_ERROR", f"OpenRouter returned status {resp.status_code}.")

    data = resp.json().get("data", [])
    models: list[ModelInfo] = []
    for entry in data:
        model_id = entry.get("id")
        if not model_id:
            continue
        pricing = entry.get("pricing") or {}
        try:
            prompt_price = float(pricing.get("prompt") or 0)
            completion_price = float(pricing.get("completion") or 0)
        except (TypeError, ValueError):
            prompt_price = completion_price = 0.0
        is_free = model_id.endswith(":free") or (prompt_price == 0 and completion_price == 0)
        pricing_label = None
        if not is_free:
            pricing_label = (
                f"${prompt_price * 1_000_000:.2f} / 1M in - "
                f"${completion_price * 1_000_000:.2f} / 1M out"
            )
        context_length = entry.get("context_length")
        models.append(ModelInfo(
            id=model_id,
            name=entry.get("name") or model_id,
            free=is_free,
            pricing=pricing_label,
            contextWindow=int(context_length) if isinstance(context_length, (int, float)) else None,
        ))
    models.sort(key=lambda m: (not m.free, m.id))
    return models


async def _fetch_anthropic_models(api_key: str, base_url: str) -> list[ModelInfo]:
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(
            f"{base_url}/v1/models",
            headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"},
        )
    if resp.status_code in (401, 403):
        raise AppError(400, "INVALID_API_KEY", "That API key was rejected by Anthropic.")
    if resp.status_code >= 400:
        raise AppError(400, "PROVIDER_ERROR", f"Anthropic returned status {resp.status_code}.")

    data = resp.json().get("data", [])
    # Anthropic has no free-tier models — every key is billed per token.
    return sorted(
        (ModelInfo(id=e["id"], name=e.get("display_name", e["id"]), free=False) for e in data if e.get("id")),
        key=lambda m: m.id,
    )


async def _fetch_google_models(api_key: str, base_url: str) -> list[ModelInfo]:
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(f"{base_url}/models", params={"key": api_key})
    if resp.status_code in (401, 403):
        raise AppError(400, "INVALID_API_KEY", "That API key was rejected by Google.")
    if resp.status_code >= 400:
        raise AppError(400, "PROVIDER_ERROR", f"Google returned status {resp.status_code}.")

    data = resp.json().get("models", [])
    models: list[ModelInfo] = []
    for entry in data:
        full_name = entry.get("name", "")  # e.g. "models/gemini-1.5-pro"
        model_id = full_name.split("/")[-1] if full_name else None
        methods = entry.get("supportedGenerationMethods", [])
        if not model_id or "generateContent" not in methods:
            continue
        # Every Gemini API key gets a free rate-limited quota by default.
        input_limit = entry.get("inputTokenLimit")
        models.append(ModelInfo(
            id=model_id,
            name=entry.get("displayName", model_id),
            free=True,
            contextWindow=int(input_limit) if isinstance(input_limit, (int, float)) else None,
        ))
    models.sort(key=lambda m: m.id)
    return models


async def fetch_models_for_key(provider: Provider, api_key: str, base_url: str | None) -> list[ModelInfo]:
    resolved_base = base_url or _DEFAULT_BASE_URL.get(provider)
    if not resolved_base:
        raise AppError(400, "MISSING_BASE_URL", "This provider needs a base URL.")

    if provider == Provider.groq:
        return await _fetch_openai_style_models(api_key, resolved_base, force_free=True)
    if provider == Provider.nvidia:
        # NVIDIA's API Catalog (build.nvidia.com) keys currently give free,
        # rate-limited access to the whole hosted model catalog.
        return await _fetch_openai_style_models(api_key, resolved_base, force_free=True)
    if provider == Provider.deepseek:
        return await _fetch_openai_style_models(api_key, resolved_base, force_paid=True)
    if provider == Provider.openai:
        return await _fetch_openai_style_models(api_key, resolved_base, force_paid=True)
    if provider == Provider.openrouter:
        return await _fetch_openrouter_models(api_key, resolved_base)
    if provider == Provider.anthropic:
        return await _fetch_anthropic_models(api_key, resolved_base)
    if provider == Provider.google:
        return await _fetch_google_models(api_key, resolved_base)
    raise AppError(400, "UNSUPPORTED_PROVIDER", "This provider is not supported yet.")


async def _get_credential_row(db: AsyncSession, user_id: str, provider: Provider) -> ProviderCredential | None:
    stmt = select(ProviderCredential).where(
        ProviderCredential.userId == user_id, ProviderCredential.provider == provider
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def list_credential_status(db: AsyncSession, user_id: str) -> list[CredentialStatus]:
    stmt = select(ProviderCredential).where(ProviderCredential.userId == user_id)
    rows = {row.provider: row for row in (await db.execute(stmt)).scalars().all()}

    result = []
    for provider in SUPPORTED_PROVIDERS:
        row = rows.get(provider)
        env_fn = _ENV_KEY_MAP.get(provider)
        result.append(CredentialStatus(
            provider=provider.value,
            hasKey=row is not None,
            envFallback=row is None and bool(env_fn and env_fn()),
            baseUrl=row.baseUrl if row else None,
        ))
    return result


async def validate_and_save_credential(
    db: AsyncSession, user_id: str, provider_str: str, api_key: str, base_url: str | None
) -> list[ModelInfo]:
    try:
        provider = Provider(provider_str)
    except ValueError:
        raise AppError(400, "UNSUPPORTED_PROVIDER", f"Unknown provider: {provider_str}")
    if provider not in SUPPORTED_PROVIDERS:
        raise AppError(400, "UNSUPPORTED_PROVIDER", "This provider is not supported yet.")
    if not api_key.strip():
        raise AppError(400, "INVALID_API_KEY", "API key cannot be empty.")

    # Validate against the real provider before persisting anything.
    models = await fetch_models_for_key(provider, api_key.strip(), base_url)

    row = await _get_credential_row(db, user_id, provider)
    encrypted = encrypt_secret(api_key.strip())
    if row is None:
        row = ProviderCredential(userId=user_id, provider=provider, encryptedKey=encrypted, baseUrl=base_url)
        db.add(row)
    else:
        row.encryptedKey = encrypted
        row.baseUrl = base_url
    await db.commit()

    return models


async def delete_credential(db: AsyncSession, user_id: str, provider_str: str) -> None:
    try:
        provider = Provider(provider_str)
    except ValueError:
        raise AppError(400, "UNSUPPORTED_PROVIDER", f"Unknown provider: {provider_str}")
    row = await _get_credential_row(db, user_id, provider)
    if row is not None:
        await db.delete(row)
        await db.commit()


async def get_models_for_user_provider(
    db: AsyncSession, user_id: str, provider_str: str
) -> tuple[bool, list[ModelInfo]]:
    """Returns (configured, models). configured=False means: no saved key and
    no server .env fallback -> the frontend should show the API key form."""
    try:
        provider = Provider(provider_str)
    except ValueError:
        raise AppError(400, "UNSUPPORTED_PROVIDER", f"Unknown provider: {provider_str}")
    if provider not in SUPPORTED_PROVIDERS:
        raise AppError(400, "UNSUPPORTED_PROVIDER", "This provider is not supported yet.")

    row = await _get_credential_row(db, user_id, provider)
    if row is not None:
        api_key = decrypt_secret(row.encryptedKey)
        base_url = row.baseUrl
    else:
        env_fn = _ENV_KEY_MAP.get(provider)
        api_key = env_fn() if env_fn else None
        base_url = None
        if not api_key:
            return False, []

    models = await fetch_models_for_key(provider, api_key, base_url)
    return True, models


def _to_usage_out(usage: ModelUsage) -> ModelUsageOut:
    return ModelUsageOut(
        model=usage.model,
        limitTokens=usage.limit_tokens,
        remainingTokens=usage.remaining_tokens,
        limitRequests=usage.limit_requests,
        remainingRequests=usage.remaining_requests,
        resetTokensSeconds=usage.reset_tokens_seconds,
        resetRequestsSeconds=usage.reset_requests_seconds,
        capturedAt=usage.captured_at,
        exhausted=usage.exhausted,
    )


def _remaining_fraction(usage: ModelUsageOut) -> float:
    """Used only to rank models within a key by how close to exhaustion they
    are - not shown to the user directly."""
    if usage.limitTokens:
        return (usage.remainingTokens or 0) / usage.limitTokens
    if usage.limitRequests:
        return (usage.remainingRequests or 0) / usage.limitRequests
    return 1.0


async def get_usage_for_provider(user_id: str, provider_str: str) -> ProviderUsageOut:
    """Real usage captured from chat calls made under this provider's key so
    far - not the static model catalog. A model only shows up here once it's
    actually been called at least once."""
    try:
        provider = Provider(provider_str)
    except ValueError:
        raise AppError(400, "UNSUPPORTED_PROVIDER", f"Unknown provider: {provider_str}")

    raw_usages = await get_key_usage(user_id, provider.value)
    models_out = [_to_usage_out(u) for u in raw_usages]
    models_out.sort(key=_remaining_fraction)
    worst = models_out[0] if models_out else None

    return ProviderUsageOut(
        provider=provider.value,
        tracked=bool(models_out),
        models=models_out,
        worst=worst,
        exhausted=any(m.exhausted for m in models_out),
    )


async def get_usage_for_all_providers(user_id: str) -> list[ProviderUsageOut]:
    return [await get_usage_for_provider(user_id, p.value) for p in SUPPORTED_PROVIDERS]
