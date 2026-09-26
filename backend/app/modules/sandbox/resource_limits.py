"""Mirrors: backend/src/modules/sandbox/resource-limits.ts"""
from dataclasses import dataclass

from app.core.config import settings


@dataclass(frozen=True)
class SandboxLimits:
    cpu: float
    memory: str
    pids: int
    timeout_ms: int
    network: str


sandbox_limits = SandboxLimits(
    cpu=settings.SANDBOX_CPU_LIMIT,
    memory=settings.SANDBOX_MEMORY_LIMIT,
    pids=settings.SANDBOX_PIDS_LIMIT,
    timeout_ms=settings.SANDBOX_TIMEOUT_MS,
    network=settings.SANDBOX_NETWORK_MODE,
)
