"""Mirrors: backend/src/modules/ai/providers/openai-compatible.provider.ts"""
import ssl

import httpx

from app.modules.ai.providers.base import AIProvider, ChatRequest, ChatResult, ProviderChatError
from app.modules.ai.rate_limit_headers import parse_rate_limit_headers


class OpenAICompatibleProvider(AIProvider):
    def __init__(self, name: str) -> None:
        self.name = name

    async def chat(self, request: ChatRequest) -> ChatResult:
        if not request.api_key:
            raise ProviderChatError(f"{self.name} provider error: {self.name} API key is not configured")

        try:
            async with httpx.AsyncClient(timeout=120) as client:
                response = await client.post(
                    f"{request.base_url}/chat/completions",
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
                f"{self.name} provider error: TLS certificate mismatch for '{request.base_url}'. "
                f"Double-check {self.name.upper()}_BASE_URL in backend/.env."
            ) from exc
        except Exception as exc:  # noqa: BLE001
            raise ProviderChatError(f"{self.name} provider error: {exc}") from exc

        rate_limit = parse_rate_limit_headers(response.headers)
        if response.status_code >= 400:
            raise ProviderChatError(
                f"{self.name} provider error: {self.name} request failed with status {response.status_code}",
                rate_limit=rate_limit,
            )
        try:
            data = response.json()
            text = (data.get("choices") or [{}])[0].get("message", {}).get("content")
            if not text:
                raise ValueError(f"{self.name} returned an empty response")
        except Exception as exc:  # noqa: BLE001
            raise ProviderChatError(f"{self.name} provider error: {exc}", rate_limit=rate_limit) from exc
        return ChatResult(text=text, rate_limit=rate_limit)