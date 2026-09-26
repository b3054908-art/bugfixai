"""Mirrors: backend/src/modules/ai/providers/openai.provider.ts"""
import httpx
import ssl

from app.core.config import settings
from app.modules.ai.providers.base import AIProvider, ChatRequest, ChatResult, ProviderChatError
from app.modules.ai.rate_limit_headers import parse_rate_limit_headers


class OpenAIProvider(AIProvider):
    async def chat(self, request: ChatRequest) -> ChatResult:
        if not request.api_key:
            raise ProviderChatError("OpenAI provider error: OpenAI API key is not configured")

        base_url = request.base_url or settings.OPENAI_BASE_URL
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                response = await client.post(
                    f"{base_url}/chat/completions",
                    headers={"content-type": "application/json", "authorization": f"Bearer {request.api_key}"},
                    json={
                        "model": request.model,
                        "messages": [
                            {"role": "system", "content": request.system},
                            {"role": "user", "content": request.user},
                        ],
                        "temperature": request.temperature,
                        "max_tokens": request.max_tokens,
                    },
                )
        except ssl.SSLCertVerificationError as exc:
            raise ProviderChatError(
                f"OpenAI provider error: TLS certificate mismatch for '{base_url}'. "
                f"Double-check OPENAI_BASE_URL in backend/.env."
            ) from exc
        except Exception as exc:  # noqa: BLE001
            raise ProviderChatError(f"OpenAI provider error: {exc}") from exc

        rate_limit = parse_rate_limit_headers(response.headers)
        if response.status_code >= 400:
            raise ProviderChatError(
                f"OpenAI provider error: OpenAI request failed with status {response.status_code}",
                rate_limit=rate_limit,
            )
        try:
            data = response.json()
            text = (data.get("choices") or [{}])[0].get("message", {}).get("content")
            if not text:
                raise ValueError("OpenAI returned an empty response")
        except Exception as exc:  # noqa: BLE001
            raise ProviderChatError(f"OpenAI provider error: {exc}", rate_limit=rate_limit) from exc
        return ChatResult(text=text, rate_limit=rate_limit)