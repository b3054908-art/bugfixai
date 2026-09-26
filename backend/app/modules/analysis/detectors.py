"""Mirrors: backend/src/modules/analysis/detectors/{build.detector,runtime.detector}.ts"""
import json
import os


async def detect_build_command(root: str, language: str) -> str:
    if language in ("JavaScript", "TypeScript"):
        pkg_path = os.path.join(root, "package.json")
        try:
            with open(pkg_path, "r", encoding="utf-8") as f:
                pkg = json.load(f)
            scripts = pkg.get("scripts", {})
            return "npm run build" if scripts.get("build") else "npm install --ignore-scripts"
        except (FileNotFoundError, json.JSONDecodeError):
            return "npm install --ignore-scripts"
    if language == "Python":
        # python:3.12-slim ships no third-party packages, so best-effort
        # install the project's own deps first (silently skipped if there's
        # no requirements.txt, or if the sandbox has no network — see
        # SANDBOX_NETWORK_MODE in .env) before the actual build check.
        return (
            "[ -f requirements.txt ] && pip install -q -r requirements.txt "
            "|| true; python -m compileall -q ."
        )
    if language == "Go":
        return "go build ./..."
    if language == "Rust":
        return "cargo check"
    return 'echo "No supported build command detected"'


async def detect_test_command(root: str, language: str) -> str:
    if language == "Python":
        uses_pytest = os.path.exists(os.path.join(root, "pytest.ini")) or os.path.exists(
            os.path.join(root, "pyproject.toml")
        )
        if uses_pytest:
            # pytest isn't in the base image; install it best-effort, then run.
            # If the sandbox has no network (SANDBOX_NETWORK_MODE=none, the
            # default), this install is a no-op and the run fails honestly
            # with "pytest: not found" rather than silently passing.
            # -v (verbose): needed for categorize_test_output() to bucket
            # unit/integration/api results by file path -- the default
            # non-verbose summary line has no per-test detail to categorize.
            return "pip install -q pytest 2>/dev/null; pytest -v"
        return "python -m unittest discover"
    if language in ("JavaScript", "TypeScript"):
        pkg_path = os.path.join(root, "package.json")
        try:
            with open(pkg_path, "r", encoding="utf-8") as f:
                pkg = json.load(f)
            if pkg.get("scripts", {}).get("test"):
                return "npm test"
        except (FileNotFoundError, json.JSONDecodeError):
            pass
        return "npm test -- --runInBand"
    if language == "Go":
        return "go test ./..."
    if language == "Rust":
        return "cargo test"
    return 'echo "No supported test command detected"'


async def detect_preview(root: str, language: str, entry_point: str | None = None) -> tuple[str | None, int | None]:
    """Best-effort detection of a runnable web-server command + port for the
    Preview feature. Returns (command, port) or (None, None) when nothing
    that looks like a web server was found. This is a guess, not a
    guarantee — e.g. a Flask app that calls app.run() without host="0.0.0.0"
    will bind to localhost-only inside the container and won't be reachable
    through the published port even though the command itself "succeeds".

    entry_point, when given, is Phase 2's single detect_entry_point() result
    (see project_inspector.py) — the Python branch below prefers it over
    re-probing the filesystem for manage.py/app.py/main.py itself.
    """
    root_pkg_path = os.path.join(root, "package.json")
    nested_pkg_path = os.path.join(root, "frontend", "package.json")
    if language in ("JavaScript", "TypeScript") or os.path.exists(nested_pkg_path):
        pkg_path = root_pkg_path
        package_dir = "."
        if not os.path.exists(pkg_path) and os.path.exists(nested_pkg_path):
            pkg_path = nested_pkg_path
            package_dir = "frontend"
        try:
            with open(pkg_path, "r", encoding="utf-8") as f:
                pkg = json.load(f)
            scripts = pkg.get("scripts", {})
            deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
            prefix = f"cd {package_dir} && " if package_dir != "." else ""
            if scripts.get("start"):
                port = 3000
                if "next" in deps:
                    port = 3000
                elif "vite" in deps:
                    port = 5173
                return f"{prefix}npm start", port
            if scripts.get("dev"):
                return f"{prefix}npm run dev -- --host 0.0.0.0", 5173 if "vite" in deps else 3000
        except (FileNotFoundError, json.JSONDecodeError):
            pass
        return None, None

    if language == "Python":
        try:
            with open(os.path.join(root, "requirements.txt"), "r", encoding="utf-8") as f:
                reqs = f.read().lower()
        except FileNotFoundError:
            reqs = ""
        # Prefer Phase 2's already-detected entry point over re-probing for
        # manage.py/app.py/main.py ourselves (was duplicated file-sniffing;
        # entry_point is the single source of truth now).
        if entry_point == "manage.py" or (entry_point is None and os.path.exists(os.path.join(root, "manage.py"))):
            return "python manage.py runserver 0.0.0.0:8000", 8000
        if "fastapi" in reqs or "uvicorn" in reqs:
            module = (entry_point or "main.py").removesuffix(".py")
            entry = f"{module}:app" if os.path.exists(os.path.join(root, f"{module}.py")) else "app:app"
            return f"pip install -q uvicorn 2>/dev/null; uvicorn {entry} --host 0.0.0.0 --port 8000", 8000
        if "flask" in reqs:
            entry = entry_point if entry_point and os.path.exists(os.path.join(root, entry_point)) else (
                "app.py" if os.path.exists(os.path.join(root, "app.py")) else "main.py"
            )
            if os.path.exists(os.path.join(root, entry)):
                return f"python {entry}", 5000
        return None, None

    if language == "Go":
        if os.path.exists(os.path.join(root, "go.mod")):
            try:
                with open(os.path.join(root, "go.mod"), "r", encoding="utf-8") as f:
                    gomod = f.read().lower()
            except FileNotFoundError:
                gomod = ""
            if any(fw in gomod for fw in ("net/http", "gin-gonic", "labstack/echo", "gofiber")):
                return "go run .", 8080
        return None, None

    if language == "Rust":
        try:
            with open(os.path.join(root, "Cargo.toml"), "r", encoding="utf-8") as f:
                cargo = f.read().lower()
        except FileNotFoundError:
            cargo = ""
        if any(fw in cargo for fw in ("actix-web", "axum", "rocket", "warp")):
            return "cargo run", 8080
        return None, None

    return None, None
