"""Mirrors: backend/src/modules/sandbox/container-manager.ts

Uses the `docker` CLI directly (matching the Node implementation's
child_process.spawn call) rather than the Python docker SDK, so behavior
and flags line up exactly. Requires the `docker` CLI to be available and
/var/run/docker.sock to be mounted into whatever process runs this
(see Dockerfile.worker, which installs docker.io and expects the socket
mount from docker-compose.yml).
"""
import asyncio
import time
from dataclasses import dataclass

from app.modules.sandbox.resource_limits import sandbox_limits
from app.modules.sandbox.sandbox_images import image_for_language


@dataclass
class CommandResult:
    code: int
    stdout: str
    stderr: str
    duration_ms: int


async def start_preview_container(workspace: str, command: str, language: str, container_port: int, name: str) -> dict:
    """Starts a LONG-RUNNING container for the Preview feature.

    Unlike execute_in_docker (one-shot, --rm, --network none), this needs to
    stay alive and accept incoming connections, so it deliberately uses
    --network bridge with a published, dynamically-assigned host port
    instead. This is a real, intentional exception to the pipeline's normal
    "no network" sandbox posture — only used when the person explicitly
    clicks Preview, never automatically.
    """
    image = image_for_language(language)
    await stop_preview_container(name)  # idempotent: replace any previous preview for this project

    args = [
        "docker", "run", "-d", "--rm",
        "--name", name,
        "--network", "bridge",
        "-p", f"0:{container_port}",
        "--cpus", str(sandbox_limits.cpu),
        "--memory", sandbox_limits.memory,
        "--pids-limit", str(sandbox_limits.pids),
        "--user", "10001:10001",
        "-v", f"{workspace}:/workspace:rw",
        "-w", "/workspace",
        image,
        "/bin/sh", "-lc", command,
    ]
    proc = await asyncio.create_subprocess_exec(*args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    _, stderr_b = await proc.communicate()
    if proc.returncode != 0:
        return {"ok": False, "error": stderr_b.decode(errors="replace").strip() or "docker run failed"}

    # Ask Docker which host port it actually assigned to the container's port.
    port_proc = await asyncio.create_subprocess_exec(
        "docker", "port", name, str(container_port),
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    out_b, err_b = await port_proc.communicate()
    if port_proc.returncode != 0 or not out_b.strip():
        await stop_preview_container(name)
        return {"ok": False, "error": err_b.decode(errors="replace").strip() or "container exited immediately"}

    # Output looks like "0.0.0.0:34567" (possibly one line per IP family).
    last_line = out_b.decode(errors="replace").strip().splitlines()[-1]
    host_port = int(last_line.rsplit(":", 1)[-1])
    return {"ok": True, "hostPort": host_port, "containerName": name}


async def execute_in_docker(
    workspace: str,
    command: str,
    language: str | None = None,
    network: str | None = None,
    extra_env: dict[str, str] | None = None,
) -> CommandResult:
    """Executes a one-shot sandbox command inside a disposable Docker container.

    network/extra_env let a caller (Phase 8, via a provisioned database
    sidecar -- see sandbox/db_sidecar.py) attach this one-shot container to
    the sidecar's dedicated network and pass it a DATABASE_URL, instead of
    always using the global --network none default. Passing neither keeps
    prior behavior exactly as it was.
    """
    image = image_for_language(language or "python")
    args = [
        "docker", "run", "--rm",
        "--network", network or sandbox_limits.network,
        "--cpus", str(sandbox_limits.cpu),
        "--memory", sandbox_limits.memory,
        "--pids-limit", str(sandbox_limits.pids),
        "--read-only",
        "--tmpfs", "/tmp:rw,noexec,nosuid,size=256m",
        "--user", "10001:10001",
        "-e", "PYTHONDONTWRITEBYTECODE=1",
        "-e", "PYTHONPYCACHEPREFIX=/tmp/pycache",
    ]
    for key, value in (extra_env or {}).items():
        args += ["-e", f"{key}={value}"]
    args += [
        "-v", f"{workspace}:/workspace:rw",
        "-w", "/workspace",
        image,
        "/bin/sh", "-lc", command,
    ]

    started = time.monotonic()
    proc = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    timeout_s = sandbox_limits.timeout_ms / 1000
    try:
        stdout_b, stderr_b = await asyncio.wait_for(proc.communicate(), timeout=timeout_s)
        duration_ms = int((time.monotonic() - started) * 1000)
        return CommandResult(
            code=proc.returncode if proc.returncode is not None else 1,
            stdout=stdout_b.decode(errors="replace"),
            stderr=stderr_b.decode(errors="replace"),
            duration_ms=duration_ms,
        )
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        duration_ms = int((time.monotonic() - started) * 1000)
        return CommandResult(
            code=124,
            stdout="",
            stderr="Sandbox timed out",
            duration_ms=duration_ms,
        )


async def stop_preview_container(name: str) -> None:
    proc = await asyncio.create_subprocess_exec(
        "docker", "stop", "-t", "2", name,
        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
    )
    await proc.wait()  # no-op (exit code ignored) if the container doesn't exist


async def is_container_running(name: str) -> bool:
    """Used by Phase 8's automatic app-start health check (not the manual
    Preview feature, which doesn't need this) to tell "started and is still
    up after N seconds" apart from "started, then crashed immediately"."""
    proc = await asyncio.create_subprocess_exec(
        "docker", "inspect", "-f", "{{.State.Running}}", name,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
    )
    out_b, _ = await proc.communicate()
    return proc.returncode == 0 and out_b.decode().strip() == "true"


async def get_container_logs(name: str, tail: int = 200) -> str:
    """Captures real stdout+stderr from a running/just-stopped container --
    used by Phase 8's app-start check to report why a boot crashed, same
    way build/test failures already capture real command output."""
    proc = await asyncio.create_subprocess_exec(
        "docker", "logs", "--tail", str(tail), name,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
    )
    out_b, _ = await proc.communicate()
    return out_b.decode(errors="replace")
