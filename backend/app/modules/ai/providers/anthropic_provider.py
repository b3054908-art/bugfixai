"""Mirrors: backend/src/modules/ai/providers/anthropic.provider.ts"""
import httpx
import ssl

from app.core.config import settings
from app.modules.ai.providers.base import AIProvider, ChatRequest, ChatResult, ProviderChatError
from app.modules.ai.rate_limit_headers import parse_rate_limit_headers


class AnthropicProvider(AIProvider):
    async def chat(self, request: ChatRequest) -> ChatResult:
        if not request.api_key:
            raise ProviderChatError("Anthropic provider error: Anthropic API key is not configured")

        base_url = request.base_url or settings.ANTHROPIC_BASE_URL
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                response = await client.post(
                    f"{base_url}/v1/messages",
                    headers={
                        "content-type": "application/json",
                        "x-api-key": request.api_key,
                        "anthropic-version": "2023-06-01",
                    },
                    json={
                        "model": request.model,
                        "system": request.system,
                        "messages": [{"role": "user", "content": request.user}],
                        "temperature": request.temperature,
                        "max_tokens": request.max_tokens,
                    },
                )
        except ssl.SSLCertVerificationError as exc:
            raise ProviderChatError(
                f"Anthropic provider error: TLS certificate mismatch for '{base_url}'. "
                f"Double-check ANTHROPIC_BASE_URL in backend/.env."
            ) from exc
        except Exception as exc:  # noqa: BLE001
            raise ProviderChatError(f"Anthropic provider error: {exc}") from exc

        # Captured before the status check: a 429 reports remaining=0, which
        # is exactly the "quota exhausted" signal usage_tracking needs.
        rate_limit = parse_rate_limit_headers(response.headers)
        if response.status_code >= 400:
            raise ProviderChatError(
                f"Anthropic provider error: Anthropic request failed with status {response.status_code}",
                rate_limit=rate_limit,
            )
        try:
            data = response.json()
            text = "\n".join(part.get("text", "") for part in data.get("content", [])).strip()
            if not text:
                raise ValueError("Anthropic returned an empty response")
        except Exception as exc:  # noqa: BLE001
            raise ProviderChatError(f"Anthropic provider error: {exc}", rate_limit=rate_limit) from exc
        return ChatResult(text=text, rate_limit=rate_limit)