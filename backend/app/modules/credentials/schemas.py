"""New module — no Node/TS counterpart.

Backs the "AI Engine & Model Management" modal's per-provider API key flow:
save a key -> validate it against the provider's real /models endpoint ->
return the live list of models, split into free / paid.
"""
from pydantic import BaseModel


class ModelInfo(BaseModel):
    id: str
    name: str
    free: bool
    # Human-readable pricing, e.g. "$0.15 / 1M in Ā· $0.60 / 1M out". None when
    # the provider doesn't expose per-model pricing in its models endpoint.
    pricing: str | None = None
    # Max context length, straight from the provider's own /models listing
    # (Groq: context_window, OpenRouter: context_length, Google:
    # inputTokenLimit). None when that provider's endpoint doesn't report it
    # (OpenAI, Anthropic, DeepSeek, NVIDIA currently don't) - never guessed.
    contextWindow: int | None = None


class ModelUsageOut(BaseModel):
    """Real quota for one (provider, model) pair, straight off that model's
    most recent chat response headers. None fields mean the provider didn't
    report that number - not that usage is unlimited."""
    model: str
    limitTokens: int | None = None
    remainingTokens: int | None = None
    limitRequests: int | None = None
    remainingRequests: int | None = None
    resetTokensSeconds: float | None = None
    resetRequestsSeconds: float | None = None
    capturedAt: float
    exhausted: bool


class ProviderUsageOut(BaseModel):
    provider: str
    # False = no chat call has gone through this key yet, so there's no real
    # usage data to show (as opposed to "usage is fine").
    tracked: bool
    models: list[ModelUsageOut] = []
    # The model closest to exhaustion among everything tracked for this key.
    worst: ModelUsageOut | None = None
    exhausted: bool = False


class CredentialStatus(BaseModel):
    provider: str
    hasKey: bool
    # True when no user key is saved but the server-wide .env already has one
    # for this provider (e.g. GROQ_API_KEY), so models can load without a key.
    envFallback: bool
    baseUrl: str | None = None


class SaveCredentialRequest(BaseModel):
    provider: str
    apiKey: str
    baseUrl: str | None = None


class SaveCredentialResponse(BaseModel):
    provider: str
    models: list[ModelInfo]


class ModelsResponse(BaseModel):
    provider: str
    configured: bool
    models: list[ModelInfo]
