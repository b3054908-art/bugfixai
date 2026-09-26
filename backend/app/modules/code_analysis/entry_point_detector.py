"""Detect the actual runnable entry-point file for a project — not the
manifest/config files the old (dead) inspect_project() entryPoints field
mistakenly checked for (package.json, requirements.txt, etc. describe a
project's dependencies, they aren't files you run).

Net-new — no TS mirror exists for this yet. This is a single source of
truth Phase 7/8 consult: today detect_preview() re-derives "which file
runs this app" itself by re-checking manage.py/app.py/main.py existence;
that duplicated check now prefers this result instead (see detectors.py).
"""
import json
import os

_PYTHON_CANDIDATES = ("manage.py", "main.py", "app.py", "wsgi.py", "asgi.py", "run.py")
_JS_CANDIDATES = ("index.js", "index.ts", "server.js", "server.ts", "app.js", "app.ts")
_GO_CANDIDATES = ("main.go",)
_RUST_CANDIDATE = os.path.join("src", "main.rs")


async def detect_entry_point(root: str, language: str) -> str | None:
    """Returns a path relative to root, or None when nothing recognizable
    was found. manage.py is checked first for Python since its presence is
    authoritative for Django regardless of what else exists."""
    if language == "Python":
        for name in _PYTHON_CANDIDATES:
            if os.path.exists(os.path.join(root, name)):
                return name
        return None

    if language in ("JavaScript", "TypeScript"):
        pkg_path = os.path.join(root, "package.json")
        try:
            with open(pkg_path, "r", encoding="utf-8") as f:
                pkg = json.load(f)
            main = pkg.get("main")
            if main and os.path.exists(os.path.join(root, main)):
                return main
        except (FileNotFoundError, json.JSONDecodeError):
            pass
        for name in _JS_CANDIDATES:
            if os.path.exists(os.path.join(root, name)):
                return name
        return None

    if language == "Go":
        for name in _GO_CANDIDATES:
            if os.path.exists(os.path.join(root, name)):
                return name
        return None

    if language == "Rust":
        if os.path.exists(os.path.join(root, _RUST_CANDIDATE)):
            return _RUST_CANDIDATE
        return None

    return None
