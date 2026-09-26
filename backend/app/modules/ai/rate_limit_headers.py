"""Shared parser for provider rate-limit response headers.

Every provider that reports quota does so via response headers on the
actual chat call (never a separate endpoint), and every provider uses a
slightly different header name and duration format:

- OpenAI-style (OpenAI, Groq, and other OpenAI-compatible providers):
  ``x-ratelimit-limit-tokens`` / ``x-ratelimit-remaining-tokens`` /
  ``x-ratelimit-limit-requests`` / ``x-ratelimit-remaining-requests`` /
  ``x-ratelimit-reset-tokens`` / ``x-ratelimit-reset-requests``, where the
  reset values are short durations like ``"2m59.56s"``.
- Anthropic: ``anthropic-ratelimit-{tokens,requests}-{limit,remaining,reset}``,
  where the reset values are RFC3339 timestamps.

This module knows about both variants and returns ``None`` for anything a
given response didn't include - never a guessed or fabricated value.
Google's Generative Language API doesn't send rate-limit headers at all, so
`parse_rate_limit_headers` naturally returns None for it, and callers treat
that the same as "not reported" for any other provider.
"""
import re
from datetime import datetime, timezone

import httpx

from app.modules.ai.providers.base import RateLimitInfo

# Matches "1h2m3.4s" / "2m59.56s" / "59.56s" style durations (OpenAI + Groq).
_DURATION_RE = re.compile(r"^(?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?$")


def _parse_duration_seconds(raw: str) -> float | None:
    match = _DURATION_RE.match(raw.strip())
    if not match or not any(match.groups()):
        return None
    hours, minutes, seconds = match.groups()
    return float(hours or 0) * 3600 + float(minutes or 0) * 60 + float(seconds or 0)


def _parse_reset(raw: str | None) -> float | None:
    """Handles both the OpenAI/Groq short-duration format and Anthropic's
    RFC3339 timestamp format, always returning seconds-from-now."""
    if not raw:
        return None
    duration = _parse_duration_seconds(raw)
    if duration is not None:
        return duration
    try:
        reset_at = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return max(0.0, (reset_at - datetime.now(timezone.utc)).total_seconds())
    except ValueError:
        return None


def _int_or_none(raw: str | None) -> int | None:
    if raw is None:
        return None
    try:
        return int(float(raw))
    except ValueError:
        return None


def parse_rate_limit_headers(headers: httpx.Headers) -> RateLimitInfo | None:
    """`headers` is case-insensitive (httpx.Headers), so no need to normalize case."""
    limit_tokens = _int_or_none(
        headers.get("x-ratelimit-limit-tokens") or headers.get("anthropic-ratelimit-tokens-limit")
    )
    remaining_tokens = _int_or_none(
        headers.get("x-ratelimit-remaining-tokens") or headers.get("anthropic-ratelimit-tokens-remaining")
    )
    limit_requests = _int_or_none(
        headers.get("x-ratelimit-limit-requests") or headers.get("anthropic-ratelimit-requests-limit")
    )
    remaining_requests = _int_or_none(
        headers.get("x-ratelimit-remaining-requests") or headers.get("anthropic-ratelimit-requests-remaining")
    )
    if limit_tokens is None and limit_requests is None:
        # Nothing usable on this response (e.g. Google, or a custom
        # self-hosted OpenAI-compatible endpoint that doesn't send these).
        return None

    return RateLimitInfo(
        limit_requests=limit_requests,
        remaining_requests=remaining_requests,
        limit_tokens=limit_tokens,
        remaining_tokens=remaining_tokens,
        reset_requests_seconds=_parse_reset(
            headers.get("x-ratelimit-reset-requests") or headers.get("anthropic-ratelimit-requests-reset")
        ),
        reset_tokens_seconds=_parse_reset(
            headers.get("x-ratelimit-reset-tokens") or headers.get("anthropic-ratelimit-tokens-reset")
        ),
    )
