"""Mirrors: backend/src/modules/ai/providers/google.provider.ts"""
from urllib.parse import quote

import httpx
import ssl

from app.core.config import settings
from app.modules.ai.providers.base import AIProvider, ChatRequest, ChatResult, ProviderChatError
from app.modules.ai.rate_limit_headers import parse_rate_limit_headers


class GoogleProvider(AIProvider):
    async def chat(self, request: ChatRequest) -> ChatResult:
        if not request.api_key:
            raise ProviderChatError("Google provider error: Google API key is not configured")

        base_url = request.base_url or settings.GOOGLE_BASE_URL
        url = f"{base_url}/models/{quote(request.model)}:generateContent?key={quote(request.api_key)}"
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                response = await client.post(
                    url,
                    headers={"content-type": "application/json"},
                    json={
                        "systemInstruction": {"parts": [{"text": request.system}]},
                        "contents": [{"role": "user", "parts": [{"text": request.user}]}],
                        "generationConfig": {
                            "temperature": request.temperature,
                            "maxOutputTokens": request.max_tokens,
                        },
                    },
                )
        except ssl.SSLCertVerificationError as exc:
            raise ProviderChatError(
                f"Google provider error: TLS certificate mismatch for '{base_url}'. "
                f"Double-check GOOGLE_BASE_URL in backend/.env."
            ) from exc
        except Exception as exc:  # noqa: BLE001
            raise ProviderChatError(f"Google provider error: {exc}") from exc

        # Google's Generative Language API doesn't send rate-limit headers,
        # so this is always None for Google - not a bug, just unreported.
        rate_limit = parse_rate_limit_headers(response.headers)
        if response.status_code >= 400:
            raise ProviderChatError(
                f"Google provider error: Google request failed with status {response.status_code}",
                rate_limit=rate_limit,
            )
        try:
            data = response.json()
            candidates = data.get("candidates") or []
            parts = (candidates[0].get("content", {}).get("parts") if candidates else []) or []
            text = "".join(p.get("text", "") for p in parts)
            if not text:
                raise ValueError("Google returned an empty response")
        except Exception as exc:  # noqa: BLE001
            raise ProviderChatError(f"Google provider error: {exc}", rate_limit=rate_limit) from exc
        return ChatResult(text=text, rate_limit=rate_limit)
