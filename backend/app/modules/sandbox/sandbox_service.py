"""Mirrors: backend/src/modules/sandbox/sandbox.service.ts"""
from app.modules.sandbox.container_manager import CommandResult
from app.modules.sandbox.docker_service import docker_execute


async def run_sandbox(
    workspace: str,
    command: str,
    language: str | None = None,
    network: str | None = None,
    extra_env: dict[str, str] | None = None,
) -> CommandResult:
    if not command.strip():
        raise ValueError("Sandbox command is required")
    return await docker_execute(workspace, command, language, network=network, extra_env=extra_env)
