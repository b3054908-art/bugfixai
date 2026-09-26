"""Mirrors: backend/src/modules/ai/ai.service.ts

Replaces the previous 501 stub. diagnose_bug and copilot_reply now make
real provider calls, using either a user's stored (encrypted) credential
or the server-wide env-configured key/base URL as a fallback, exactly
like the Node version's `credentials()` helper.
"""
import json
from typing import Awaitable, Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.errors.app_error import AppError
from app.core.config import settings
from app.core.secret_crypto import decrypt_secret
from app.models.enums import Provider
from app.models.settings import ProviderCredential
from app.modules.ai.confidence import clamp_confidence
from app.modules.ai.context_builder import build_ai_context
from app.modules.ai.model_router import resolve_model
from app.modules.ai.prompt_builder import build_copilot_prompt, build_diagnosis_prompt, build_patch_prompt, build_root_cause_prompt
from app.modules.ai.providers.anthropic_provider import AnthropicProvider
from app.modules.ai.confidence import clamp_confidence
from app.modules.ai.context_builder import build_ai_context
from app.modules.ai.model_router import resolve_model
from app.modules.ai.prompt_builder import build_copilot_prompt, build_diagnosis_prompt, build_patch_prompt, build_root_cause_prompt
from app.modules.ai.providers.anthropic_provider import AnthropicProvider
from app.modules.ai.providers.base import AIProvider, ChatRequest, ProviderChatError
from app.modules.ai.providers.google_provider import GoogleProvider
from app.modules.ai.providers.openai_compatible_provider import OpenAICompatibleProvider
from app.modules.ai.providers.openai_provider import OpenAIProvider
from app.modules.ai.usage_tracking import record_rate_limit

_ENV_KEY_MAP = {
    "openai": lambda: settings.OPENAI_API_KEY,
    "anthropic": lambda: settings.ANTHROPIC_API_KEY,
    "google": lambda: settings.GOOGLE_API_KEY,
    "groq": lambda: settings.GROQ_API_KEY,
    "openrouter": lambda: settings.OPENROUTER_API_KEY,
    "deepseek": lambda: settings.DEEPSEEK_API_KEY,
    "nvidia": lambda: settings.NVIDIA_API_KEY,
}
_ENV_URL_MAP = {
    "openai": lambda: settings.OPENAI_BASE_URL,
    "anthropic": lambda: settings.ANTHROPIC_BASE_URL,
    "google": lambda: settings.GOOGLE_BASE_URL,
    "groq": lambda: settings.GROQ_BASE_URL,
    "openrouter": lambda: settings.OPENROUTER_BASE_URL,
    "deepseek": lambda: settings.DEEPSEEK_BASE_URL,
    "nvidia": lambda: settings.NVIDIA_BASE_URL,
}


def _provider_for(provider: str) -> AIProvider:
    if provider == "openai":
        return OpenAIProvider()
    if provider == "anthropic":
        return AnthropicProvider()
    if provider == "google":
        return GoogleProvider()
    if provider in ("groq", "openrouter", "deepseek", "nvidia"):
        return OpenAICompatibleProvider(provider)
    raise AppError(400, "UNSUPPORTED_PROVIDER", "The requested AI provider is not supported")


async def _credentials(db: AsyncSession, user_id: str, provider: str) -> dict:
    try:
        provider_enum = Provider(provider)
    except ValueError:
        raise AppError(400, "UNSUPPORTED_PROVIDER", "The requested AI provider is not supported")

    stmt = select(ProviderCredential).where(
        ProviderCredential.userId == user_id, ProviderCredential.provider == provider_enum
    )
    record = (await db.execute(stmt)).scalar_one_or_none()
    url_fn = _ENV_URL_MAP.get(provider)
    if record:
        # A saved credential may not have a custom base URL (the "bring your
        # own key" flow doesn't ask for one) — fall back to the provider's
        # default base URL rather than passing None into the HTTP request.
        return {
            "key": decrypt_secret(record.encryptedKey),
            "base_url": record.baseUrl or (url_fn() if url_fn else None),
        }

    key_fn = _ENV_KEY_MAP.get(provider)
    return {
        "key": key_fn() if key_fn else None,
        "base_url": url_fn() if url_fn else None,
    }

def _parse_json(text: str) -> dict:
    clean = text.strip()
    if clean.startswith("```"):
        clean = clean.split("\n", 1)[-1] if "\n" in clean else clean
        clean = clean.removeprefix("json\n").removeprefix("json")
    clean = clean.strip().removeprefix("```json").removesuffix("```").strip()
    try:
        return json.loads(clean)
    except json.JSONDecodeError:
        start = clean.find("{")
        end = clean.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(clean[start : end + 1])
            except json.JSONDecodeError:
                pass
        raise ValueError(
            "The AI model's reply wasn't valid JSON, so it couldn't be parsed. "
            "This can happen with reasoning models on complex files — try again, "
            "or switch to a non-reasoning model for this task."
        )


async def diagnose_root_cause(
    db: AsyncSession,
    user_id: str,
    project_id: str,
    bug_id: str,
    provider: str | None = None,
    model: str | None = None,
    on_understand: Callable[[], Awaitable[None]] | None = None,
    on_trace: Callable[[], Awaitable[None]] | None = None,
    on_root_cause: Callable[[], Awaitable[None]] | None = None,
    on_impact: Callable[[], Awaitable[None]] | None = None,
) -> dict:
    """Phase 5: AI Root Cause Analysis. First of two real, separate AI
    calls (Job 4) -- diagnosis only, no patch. See build_root_cause_prompt.

    The four on_* callbacks are optional hooks fired at the real moment
    each of Phase 5's four steps (Understand error / Trace relevant code /
    Determine root cause / Determine impact) actually finishes for this
    bug, so a caller (the pipeline runner) can report live per-step
    progress instead of one opaque call."""
    resolved = await resolve_model(db, provider, model, user_id)
    creds = await _credentials(db, user_id, resolved.provider)
    # NOTE: user_id is now forwarded -- previously omitted here, which
    # silently skipped _gather_live_workspace_context entirely (it only
    # runs `if user_id:`), meaning the automated pipeline's diagnosis never
    # actually read live IDE source, even though the manual copilot-chat
    # path did. Trace relevant code is only real once this is passed.
    context = await build_ai_context(
        db, project_id, user_id=user_id, bug_id=bug_id,
        on_understand=on_understand, on_trace=on_trace,
    )

    chat_request = ChatRequest(
        model=resolved.model,
        system="You are a senior debugging engineer.",
        user=build_root_cause_prompt(context),
        api_key=creds["key"],
        base_url=creds["base_url"],
    )
    try:
        chat_result = await _provider_for(resolved.provider).chat(chat_request)
    except ProviderChatError as exc:
        if exc.rate_limit:
            await record_rate_limit(user_id, resolved.provider, resolved.model, exc.rate_limit)
        raise

    if chat_result.rate_limit:
        await record_rate_limit(user_id, resolved.provider, resolved.model, chat_result.rate_limit)

    result = _parse_json(chat_result.text)

    root_cause = str(result.get("rootCause", ""))
    if on_root_cause:
        await on_root_cause()

    blast_radius = str(result.get("blastRadius", ""))
    if on_impact:
        await on_impact()

    return {
        "provider": resolved.provider,
        "model": resolved.model,
        "rootCause": root_cause,
        "explanation": str(result.get("explanation", "")),
        "confidence": clamp_confidence(float(result.get("confidence", 0) or 0)),
        "affectedFiles": [str(f) for f in (result.get("affectedFiles") or [])],
        "blastRadius": blast_radius,
    }


async def generate_patch(
    db: AsyncSession,
    user_id: str,
    project_id: str,
    bug_id: str,
    diagnosis: dict,
    provider: str | None = None,
    model: str | None = None,
) -> dict:
    """Phase 6: AI Patch Generation. Second of two real, separate AI calls
    (Job 4) -- takes Phase 5's settled diagnosis as a hard input rather than
    re-deriving root cause, so the patch can't silently diverge from it.
    Reuses the *same* provider/model resolved for diagnosis unless the
    caller explicitly overrides -- keeps one bug's attempt on one model
    instead of mixing providers mid-diagnosis."""
    resolved = await resolve_model(db, provider or diagnosis.get("provider"), model or diagnosis.get("model"), user_id)
    creds = await _credentials(db, user_id, resolved.provider)
    context = await build_ai_context(db, project_id, bug_id=bug_id)

    chat_request = ChatRequest(
        model=resolved.model,
        system="You are a senior debugging engineer.",
        user=build_patch_prompt(context, diagnosis),
        api_key=creds["key"],
        base_url=creds["base_url"],
    )
    try:
        chat_result = await _provider_for(resolved.provider).chat(chat_request)
    except ProviderChatError as exc:
        if exc.rate_limit:
            await record_rate_limit(user_id, resolved.provider, resolved.model, exc.rate_limit)
        raise

    if chat_result.rate_limit:
        await record_rate_limit(user_id, resolved.provider, resolved.model, chat_result.rate_limit)

    result = _parse_json(chat_result.text)

    return {
        "provider": resolved.provider,
        "model": resolved.model,
        "patchSummary": str(result.get("patchSummary", "")),
        "estimatedMinutes": max(1, int(result.get("estimatedMinutes", 15) or 15)),
        "originalCode": str(result.get("originalCode", "")),
        "proposedCode": str(result.get("proposedCode", "")),
        "unifiedDiff": str(result.get("unifiedDiff", "")),
    }


async def diagnose_bug(
    db: AsyncSession,
    user_id: str,
    project_id: str,
    bug_id: str,
    provider: str | None = None,
    model: str | None = None,
) -> dict:
    """LEGACY combined entry point -- now implemented as the same two real,
    separate calls Phase 5/6 use (diagnose_root_cause then generate_patch)
    rather than one merged prompt, so any caller still using this single
    function gets identical fields back with no behavior change."""
    diagnosis = await diagnose_root_cause(db, user_id, project_id, bug_id, provider, model)
    patch = await generate_patch(db, user_id, project_id, bug_id, diagnosis, diagnosis["provider"], diagnosis["model"])

    root_cause = diagnosis.get("rootCause", "")
    explanation = diagnosis.get("explanation", "")
    combined_explanation = f"Root cause: {root_cause}\n\n{explanation}" if root_cause else explanation

    return {
        "provider": patch["provider"],
        "model": patch["model"],
        "confidence": diagnosis["confidence"],
        "explanation": combined_explanation,
        "patchSummary": patch["patchSummary"],
        "affectedFiles": diagnosis["affectedFiles"],
        "estimatedMinutes": patch["estimatedMinutes"],
        "originalCode": patch["originalCode"],
        "proposedCode": patch["proposedCode"],
        "unifiedDiff": patch["unifiedDiff"],
    }


async def copilot_reply(
    db: AsyncSession,
    user_id: str,
    project_id: str | None,
    user_message: str,
    provider: str | None = None,
    model: str | None = None,
    file_path: str | None = None,
) -> dict:
    resolved = await resolve_model(db, provider, model, user_id)
    creds = await _credentials(db, user_id, resolved.provider)
    context = await build_ai_context(db, project_id, user_id=user_id, file_path=file_path, question=user_message) if project_id else "{}"

    chat_request = ChatRequest(
        model=resolved.model,
        system="You are a repository-aware coding copilot.",
        user=build_copilot_prompt(context, user_message),
        api_key=creds["key"],
        base_url=creds["base_url"],
    )
    try:
        chat_result = await _provider_for(resolved.provider).chat(chat_request)
        if chat_result.rate_limit:
            await record_rate_limit(user_id, resolved.provider, resolved.model, chat_result.rate_limit)
        result = _parse_json(chat_result.text)
    except ProviderChatError as exc:
        if exc.rate_limit:
            await record_rate_limit(user_id, resolved.provider, resolved.model, exc.rate_limit)
        raise AppError(502, "AI_PROVIDER_ERROR", str(exc)) from exc
    except ValueError as exc:
        raise AppError(502, "AI_PROVIDER_ERROR", str(exc)) from exc
    return {"provider": resolved.provider, "model": resolved.model, "result": result}