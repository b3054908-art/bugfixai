"""Detect which database (if any) a project expects to connect to.

Net-new — no TS mirror exists for this yet. Consumed by two later phases,
not just displayed: Phase 7 (Isolated Environment) uses this to decide
whether to provision a matching database sidecar container, and Phase 5
(AI Root Cause Analysis) is told the result so a connection-refused error
in a sandbox with no real database gets read as an environment gap rather
than misdiagnosed as an application bug worth patching.

Detection is intentionally conservative: it only returns a type when it
finds a real driver/library dependency (or an explicit docker-compose
service image) for that database. It does not try to infer "this project
probably wants Postgres" from framework choice alone.
"""
import json
import os

_PYTHON_DRIVER_HINTS = {
    "postgres": ("psycopg2", "psycopg", "asyncpg"),
    "mysql": ("pymysql", "mysqlclient", "mysql-connector-python", "aiomysql"),
    "mongodb": ("pymongo", "motor"),
    "sqlite": ("aiosqlite",),
}

_JS_DEPENDENCY_HINTS = {
    "postgres": ("pg", "postgres", "@prisma/client"),
    "mysql": ("mysql", "mysql2"),
    "mongodb": ("mongodb", "mongoose"),
    "sqlite": ("sqlite3", "better-sqlite3"),
}

_GO_MODULE_HINTS = {
    "postgres": ("lib/pq", "jackc/pgx", "jinzhu/gorm"),
    "mysql": ("go-sql-driver/mysql",),
    "mongodb": ("mongo-driver",),
}

_RUST_CRATE_HINTS = {
    "postgres": ("tokio-postgres", "postgres ="),
    "mysql": ("mysql_async", "mysql ="),
    "mongodb": ("mongodb =",),
}

_COMPOSE_IMAGE_HINTS = {
    "postgres": ("postgres:", "postgres@", "image: postgres"),
    "mysql": ("mysql:", "mariadb:", "image: mysql", "image: mariadb"),
    "mongodb": ("mongo:", "image: mongo"),
    "redis": ("redis:", "image: redis"),
}


def _first_match(text: str, hints: dict[str, tuple[str, ...]]) -> str | None:
    for db_type, needles in hints.items():
        if any(needle in text for needle in needles):
            return db_type
    return None


async def _check_compose_files(root: str) -> str | None:
    """Cross-language fallback: many repos declare their own DB dependency
    via a docker-compose service image rather than (or in addition to) an
    app-level driver import."""
    for filename in ("docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"):
        path = os.path.join(root, filename)
        try:
            with open(path, "r", encoding="utf-8") as f:
                content = f.read().lower()
        except FileNotFoundError:
            continue
        match = _first_match(content, _COMPOSE_IMAGE_HINTS)
        if match:
            return match
    return None


async def detect_database(root: str, language: str) -> str | None:
    """Returns one of "postgres", "mysql", "mongodb", "sqlite", "redis", or
    None when no database dependency was found. Only the first three have a
    sidecar provisioner (see sandbox/db_sidecar.py); sqlite needs no sidecar
    (file-based) and redis detection exists but has no sidecar yet."""
    if language == "Python":
        try:
            with open(os.path.join(root, "requirements.txt"), "r", encoding="utf-8") as f:
                reqs = f.read().lower()
        except FileNotFoundError:
            reqs = ""
        match = _first_match(reqs, _PYTHON_DRIVER_HINTS)
        if match:
            return match
        # Django's settings.py ENGINE line is the idiomatic place Django
        # itself declares the backend, even when the driver package name
        # doesn't literally appear in requirements.txt (e.g. it's pulled in
        # transitively, or the project uses the stdlib sqlite3 backend).
        for dirpath, _dirs, filenames in os.walk(root):
            if "settings.py" in filenames:
                try:
                    with open(os.path.join(dirpath, "settings.py"), "r", encoding="utf-8") as f:
                        settings_src = f.read().lower()
                except (FileNotFoundError, UnicodeDecodeError):
                    continue
                if "engine" in settings_src:
                    if "postgresql" in settings_src:
                        return "postgres"
                    if "mysql" in settings_src:
                        return "mysql"
                    if "sqlite3" in settings_src:
                        return "sqlite"
                break  # only check the first settings.py found

    elif language in ("JavaScript", "TypeScript"):
        pkg_path = os.path.join(root, "package.json")
        try:
            with open(pkg_path, "r", encoding="utf-8") as f:
                pkg = json.load(f)
            deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
            match = _first_match(" ".join(deps.keys()), _JS_DEPENDENCY_HINTS)
            if match:
                return match
        except (FileNotFoundError, json.JSONDecodeError):
            pass

    elif language == "Go":
        try:
            with open(os.path.join(root, "go.mod"), "r", encoding="utf-8") as f:
                gomod = f.read().lower()
            match = _first_match(gomod, _GO_MODULE_HINTS)
            if match:
                return match
        except FileNotFoundError:
            pass

    elif language == "Rust":
        try:
            with open(os.path.join(root, "Cargo.toml"), "r", encoding="utf-8") as f:
                cargo = f.read().lower()
            match = _first_match(cargo, _RUST_CRATE_HINTS)
            if match:
                return match
        except FileNotFoundError:
            pass

    return await _check_compose_files(root)
