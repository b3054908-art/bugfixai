"""Mirrors: backend/src/modules/ai/providers/base.provider.ts"""
from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class ChatRequest:
    model: str
    system: str
    user: str
    api_key: str | None = None
    base_url: str | None = None
    max_tokens: int = 6000
    temperature: float = 0.1


@dataclass
class RateLimitInfo:
    """Real quota numbers read straight off the provider's response headers
    for this exact model. Anything a given provider doesn't report stays
    None - never guessed or estimated. See modules/ai/rate_limit_headers.py."""
    limit_requests: int | None = None
    remaining_requests: int | None = None
    limit_tokens: int | None = None
    remaining_tokens: int | None = None
    reset_requests_seconds: float | None = None
    reset_tokens_seconds: float | None = None


@dataclass
class ChatResult:
    text: str
    rate_limit: RateLimitInfo | None = None


class ProviderChatError(ValueError):
    """Raised when a provider call fails. Carries whatever rate-limit info
    came back alongside the error response (a 429 typically reports
    remaining=0), so callers can still record real usage data on failure -
    not just on success."""

    def __init__(self, message: str, rate_limit: RateLimitInfo | None = None) -> None:
        super().__init__(message)
        self.rate_limit = rate_limit


class AIProvider(ABC):
    @abstractmethod
    async def chat(self, request: ChatRequest) -> ChatResult: ...
