"""Provisions a lightweight, disposable database container alongside an
analysis run's sandbox, so Phase 8's install/build/run/test doesn't fail
with a bare connection-refused error for any real project that expects a
database (--network none, the sandbox default, has no database reachable
at all).

Net-new -- no TS mirror exists for this yet. Only postgres and mysql are
supported for now (the two with a trivial, fast-starting official image
and a simple readiness check). mongodb/redis detection exists
(database_detector.py) but has no sidecar here yet -- start_database_sidecar
returns None for those and the caller logs the gap rather than silently
proceeding as if a database were available.

Uses a dedicated user-defined Docker network per run: the default `bridge`
network (what start_preview_container uses) does NOT support container-name
DNS resolution between containers, so the sandbox's one-shot containers
couldn't reach a sidecar by hostname on it. A user-defined network does.
"""
import asyncio
import time

_SUPPORTED = {
    "postgres": {
        "image": "postgres:16-alpine",
        "port": 5432,
        "env": {"POSTGRES_USER": "sandbox", "POSTGRES_PASSWORD": "sandbox", "POSTGRES_DB": "app"},
        "ready_cmd": ["pg_isready", "-U", "sandbox"],
        "url": "postgresql://sandbox:sandbox@{host}:5432/app",
    },
    "mysql": {
        "image": "mysql:8.0",
        "port": 3306,
        "env": {"MYSQL_ROOT_PASSWORD": "sandbox", "MYSQL_DATABASE": "app", "MYSQL_USER": "sandbox", "MYSQL_PASSWORD": "sandbox"},
        "ready_cmd": ["mysqladmin", "ping", "-h", "127.0.0.1", "-usandbox", "-psandbox"],
        "url": "mysql://sandbox:sandbox@{host}:3306/app",
    },
}

_READY_TIMEOUT_S = 30
_READY_POLL_INTERVAL_S = 1


def _network_name(run_id: str) -> str:
    return f"bugfixer-dbnet-{run_id}"


def _container_name(run_id: str) -> str:
    return f"bugfixer-dbsidecar-{run_id}"


async def _run(*args: str) -> tuple[int, str, str]:
    proc = await asyncio.create_subprocess_exec(*args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    stdout_b, stderr_b = await proc.communicate()
    return proc.returncode or 0, stdout_b.decode(errors="replace"), stderr_b.decode(errors="replace")


async def _wait_ready(container: str, ready_cmd: list[str]) -> bool:
    deadline = time.monotonic() + _READY_TIMEOUT_S
    while time.monotonic() < deadline:
        code, _out, _err = await _run("docker", "exec", container, *ready_cmd)
        if code == 0:
            return True
        await asyncio.sleep(_READY_POLL_INTERVAL_S)
    return False


async def start_database_sidecar(db_type: str, run_id: str) -> dict | None:
    """Starts (network + container) a sidecar for db_type, waits for it to
    accept connections, and returns {"network", "container_name", "env"}
    where env is ready to pass straight into run_sandbox(extra_env=...) for
    Phase 8's install/build/run/test commands. Returns None for an
    unsupported db_type -- caller must handle that as "no sidecar available"
    rather than assume success."""
    spec = _SUPPORTED.get(db_type)
    if spec is None:
        return None

    network = _network_name(run_id)
    container = _container_name(run_id)

    code, _out, err = await _run("docker", "network", "create", network)
    if code != 0 and "already exists" not in err:
        return None

    run_args = ["docker", "run", "-d", "--rm", "--name", container, "--network", network]
    for key, value in spec["env"].items():
        run_args += ["-e", f"{key}={value}"]
    run_args.append(spec["image"])

    code, _out, err = await _run(*run_args)
    if code != 0:
        await _run("docker", "network", "rm", network)
        return None

    ready = await _wait_ready(container, spec["ready_cmd"])
    if not ready:
        await stop_database_sidecar(run_id)
        return None

    database_url = spec["url"].format(host=container)
    return {
        "network": network,
        "container_name": container,
        "env": {"DATABASE_URL": database_url},
    }


async def stop_database_sidecar(run_id: str) -> None:
    container = _container_name(run_id)
    network = _network_name(run_id)
    await _run("docker", "stop", "-t", "2", container)
    # -d --rm already removes the container on stop; the network needs an
    # explicit rm and a short retry since Docker can take a moment to fully
    # detach the just-stopped container from it.
    for _ in range(5):
        code, _out, err = await _run("docker", "network", "rm", network)
        if code == 0 or "not found" in err:
            return
        await asyncio.sleep(1)
