"""Mirrors: backend/src/modules/sandbox/docker.service.ts"""
from app.modules.sandbox.container_manager import CommandResult, execute_in_docker


async def docker_execute(
    workspace: str,
    command: str,
    language: str | None = None,
    network: str | None = None,
    extra_env: dict[str, str] | None = None,
) -> CommandResult:
    return await execute_in_docker(workspace, command, language, network=network, extra_env=extra_env)
