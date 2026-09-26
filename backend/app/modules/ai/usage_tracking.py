"""Tracks real per-user, per-model API quota exactly as reported by each
provider's own rate-limit response headers (see rate_limit_headers.py) -
never an estimate. Backed by Redis, since these windows are always
short-lived (minutes to a day) and this mirrors how the app already bridges
short-lived, frequently-changing state (see common/websocket/realtime_gateway.py).

Rate limits are inherently per (provider, model): a provider has to know
which model you're calling before it can tell you that model's quota. So
that's the unit of truth stored here. The "per API key" view exposed by
get_key_usage() is a derived summary across every model we've actually seen
that key call - never a fabricated account-wide number, since most providers
don't expose one.

This is a nice-to-have on top of the real diagnose/copilot flow, never a
dependency of it: every Redis call here is defensive, so a Redis blip
degrades to "no usage data" instead of a 500 in the usage endpoints, and
instead of silently swallowing a real chat/diagnosis result in
ai/service.py.
"""
import json
import time
from dataclasses import asdict, dataclass

import redis.exceptions
import structlog

from app.core.redis_client import get_redis_client
from app.modules.ai.providers.base import RateLimitInfo

logger = structlog.get_logger(__name__)

_KEY_PREFIX = "usage"
_MODEL_INDEX_TTL = 60 * 60 * 24 * 2  # 2 days - just keeps the per-key model index tidy
_MIN_ENTRY_TTL = 300  # floor for providers whose reset windows are very short


def _usage_key(user_id: str, provider: str, model: str) -> str:
    return f"{_KEY_PREFIX}:{user_id}:{provider}:{model}"


def _models_index_key(user_id: str, provider: str) -> str:
    return f"{_KEY_PREFIX}:models:{user_id}:{provider}"


@dataclass
class ModelUsage:
    model: str
    limit_tokens: int | None
    remaining_tokens: int | None
    limit_requests: int | None
    remaining_requests: int | None
    reset_tokens_seconds: float | None
    reset_requests_seconds: float | None
    captured_at: float

    @property
    def exhausted(self) -> bool:
        return self.remaining_tokens == 0 or self.remaining_requests == 0


async def record_rate_limit(user_id: str, provider: str, model: str, info: RateLimitInfo) -> None:
    """Persists the quota reported on one real API response. Called after
    every chat call that returns usable headers - success or failure alike,
    since a 429 reporting remaining=0 is exactly the signal this exists for.

    Never raises: this runs right after a real diagnose/copilot call, and a
    Redis problem here must not turn into a failed bug diagnosis just
    because the quota display couldn't be updated."""
    try:
        client = get_redis_client()
        usage = ModelUsage(
            model=model,
            limit_tokens=info.limit_tokens,
            remaining_tokens=info.remaining_tokens,
            limit_requests=info.limit_requests,
            remaining_requests=info.remaining_requests,
            reset_tokens_seconds=info.reset_tokens_seconds,
            reset_requests_seconds=info.reset_requests_seconds,
            captured_at=time.time(),
        )
        ttl = int(max(info.reset_tokens_seconds or 0, info.reset_requests_seconds or 0, _MIN_ENTRY_TTL))
        await client.set(_usage_key(user_id, provider, model), json.dumps(asdict(usage)), ex=ttl)

        index_key = _models_index_key(user_id, provider)
        await client.sadd(index_key, model)
        await client.expire(index_key, _MODEL_INDEX_TTL)
    except redis.exceptions.RedisError as exc:
        logger.warning("usage_tracking.record_failed", provider=provider, model=model, error=str(exc))


async def get_model_usage(user_id: str, provider: str, model: str) -> ModelUsage | None:
    try:
        client = get_redis_client()
        raw = await client.get(_usage_key(user_id, provider, model))
    except redis.exceptions.RedisError as exc:
        logger.warning("usage_tracking.read_failed", provider=provider, model=model, error=str(exc))
        return None
    if not raw:
        return None
    return ModelUsage(**json.loads(raw))


async def get_key_usage(user_id: str, provider: str) -> list[ModelUsage]:
    """Every model we've captured real quota data for under this provider's
    key. Entries that expired naturally (reset window passed) are dropped
    from the index as a side effect, so it never grows unbounded.

    Returns an empty list (rather than raising) if Redis is unreachable, so
    the usage endpoints degrade to "no data yet" instead of a 500."""
    try:
        client = get_redis_client()
        index_key = _models_index_key(user_id, provider)
        model_ids = await client.smembers(index_key)
    except redis.exceptions.RedisError as exc:
        logger.warning("usage_tracking.key_usage_failed", provider=provider, error=str(exc))
        return []

    usages: list[ModelUsage] = []
    stale: list[str] = []
    for model_id in model_ids:
        usage = await get_model_usage(user_id, provider, model_id)
        if usage is None:
            stale.append(model_id)
        else:
            usages.append(usage)
    if stale:
        try:
            client = get_redis_client()
            await client.srem(_models_index_key(user_id, provider), *stale)
        except redis.exceptions.RedisError as exc:
            logger.warning("usage_tracking.index_cleanup_failed", provider=provider, error=str(exc))
    return usages
