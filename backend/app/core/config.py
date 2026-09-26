"""
Environment configuration.
Mirrors: backend/src/config/env.ts (zod schema -> pydantic-settings)
"""
from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/core/config.py -> backend/. Used to anchor STORAGE_ROOT and
# SANDBOX_WORK_ROOT to an absolute path, so the API server and the Celery
# worker resolve to the SAME directory regardless of which working directory
# each process happens to be launched from. A relative default here (e.g.
# "./storage") silently resolves differently per-process's cwd, which is
# exactly why an upload can succeed in the API process but the same file
# can't be found by the worker moments later ("ZIP archive could not be read").
_BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent

# Expected host for each provider's base URL. Used to catch typos in .env
# early (at startup) instead of letting them surface as confusing SSL/
# hostname-mismatch errors deep inside a provider HTTP call.
_EXPECTED_HOSTS = {
    "OPENAI_BASE_URL": "api.openai.com",
    "ANTHROPIC_BASE_URL": "api.anthropic.com",
    "GOOGLE_BASE_URL": "generativelanguage.googleapis.com",
    "GROQ_BASE_URL": "api.groq.com",
    "OPENROUTER_BASE_URL": "openrouter.ai",
    "DEEPSEEK_BASE_URL": "api.deepseek.com",
    "NVIDIA_BASE_URL": "integrate.api.nvidia.com",
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    NODE_ENV: Literal["development", "test", "production"] = "development"
    PORT: int = Field(default=4000, ge=1, le=65535)
    CORS_ORIGIN: str

    DATABASE_URL: str
    REDIS_URL: str

    JWT_SECRET: str = Field(min_length=32)
    JWT_EXPIRES_IN: str = "1h"
    REFRESH_TOKEN_EXPIRES_IN: str = "30d"

    STORAGE_ROOT: str = str(_BACKEND_ROOT / "storage")
    SANDBOX_WORK_ROOT: str = str(_BACKEND_ROOT / "sandbox-work")
    MAX_UPLOAD_BYTES: int = 524_288_000
    SANDBOX_TIMEOUT_MS: int = 300_000
    SANDBOX_CPU_LIMIT: float = 2
    SANDBOX_MEMORY_LIMIT: str = "4g"
    SANDBOX_PIDS_LIMIT: int = 256
    SANDBOX_NETWORK_MODE: Literal["none", "bridge"] = "none"

    @field_validator("STORAGE_ROOT", "SANDBOX_WORK_ROOT")
    @classmethod
    def _resolve_storage_path(cls, value: str) -> str:
        """Even if .env explicitly sets a relative path (e.g. the
        .env.example default 'STORAGE_ROOT=./storage'), anchor it to the
        backend/ directory instead of whatever cwd the process happened to
        start from — this is what makes the API server and worker agree on
        the same real path for the same file."""
        path = Path(value)
        return str(path if path.is_absolute() else (_BACKEND_ROOT / path).resolve())

    GITHUB_API_URL: str = "https://api.github.com"
    GITHUB_APP_CLIENT_ID: str | None = None
    GITHUB_APP_CLIENT_SECRET: str | None = None

    OPENAI_API_KEY: str | None = None
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"
    ANTHROPIC_API_KEY: str | None = None
    ANTHROPIC_BASE_URL: str = "https://api.anthropic.com"
    GOOGLE_API_KEY: str | None = None
    GOOGLE_BASE_URL: str = "https://generativelanguage.googleapis.com/v1beta"
    GROQ_API_KEY: str | None = None
    GROQ_BASE_URL: str = "https://api.groq.com/openai/v1"
    OPENROUTER_API_KEY: str | None = None
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    DEEPSEEK_API_KEY: str | None = None
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com/v1"
    NVIDIA_API_KEY: str | None = None
    NVIDIA_BASE_URL: str = "https://integrate.api.nvidia.com/v1"

    DEFAULT_AI_PROVIDER: Literal[
        "openai", "anthropic", "google", "groq", "openrouter", "deepseek", "nvidia"
    ] = "openai"
    DEFAULT_AI_MODEL: str = "gpt-4o-mini"

    ENCRYPTION_KEY: str = Field(min_length=32)
    DEV_SKIP_AUTH: bool = False
    LOG_LEVEL: Literal[
        "fatal", "error", "warn", "info", "debug", "trace", "silent"
    ] = "info"

    @field_validator("DATABASE_URL")
    @classmethod
    def _normalize_db_url(cls, v: str) -> str:
        # SQLAlchemy async needs the asyncpg dialect explicitly.
        if v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v

    @field_validator(
        "OPENAI_BASE_URL",
        "ANTHROPIC_BASE_URL",
        "GOOGLE_BASE_URL",
        "GROQ_BASE_URL",
        "OPENROUTER_BASE_URL",
        "DEEPSEEK_BASE_URL",
        "NVIDIA_BASE_URL",
    )
    @classmethod
    def _check_base_url_host(cls, v: str, info) -> str:
        expected = _EXPECTED_HOSTS.get(info.field_name)
        actual = urlparse(v).hostname
        if expected and actual != expected:
            raise ValueError(
                f"{info.field_name} looks wrong: expected host '{expected}', "
                f"got '{actual}'. Check backend/.env for a typo."
            )
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


settings = get_settings()