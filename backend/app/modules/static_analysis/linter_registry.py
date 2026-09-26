"""Deterministic, zero-AI-cost linters run per detected language.

Each entry defines the pip-install-and-run shell command executed inside
the sandbox (one container invocation per tool, same mechanism as
build/test -- see modules/sandbox), and a parser that turns that tool's
raw stdout into a list of plain finding dicts:
    {tool, severity, file, line, code, message}

Covers, per the Static Analysis phase card's 5 listed categories:
  - Syntax errors   -> flake8
  - Lint errors     -> flake8, ruff
  - Type errors     -> mypy
  - Security issues -> bandit (code-level)
  - Dependency issues -> pip-audit (known-vulnerable versions in
    requirements.txt, via the OSV database -- needs network; see
    SANDBOX_NETWORK_MODE)

HONEST GAP: only Python has real linters registered right now. JS/TS/Go/
Rust fall through to the "unsupported" path in service.py rather than
fabricating results -- matches the existing GitHub-source honest-gap
pattern already used in pipeline_runner.py.
"""
import json


def _parse_flake8(stdout: str) -> list[dict]:
    """flake8 default format: path:line:col: CODE message"""
    findings = []
    for raw_line in stdout.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        parts = line.split(":", 3)
        if len(parts) < 4:
            continue
        file_path, line_no, _col, rest = parts
        rest = rest.strip()
        code, _, message = rest.partition(" ")
        findings.append({
            "tool": "flake8",
            "severity": "warning",
            "file": file_path.strip(),
            "line": int(line_no) if line_no.strip().isdigit() else None,
            "code": code.strip(),
            "message": message.strip() or rest,
        })
    return findings


def _parse_bandit(stdout: str) -> list[dict]:
    """bandit -f json output."""
    findings = []
    try:
        data = json.loads(stdout or "{}")
    except json.JSONDecodeError:
        return findings
    for item in data.get("results", []):
        findings.append({
            "tool": "bandit",
            "severity": (item.get("issue_severity") or "MEDIUM").lower(),
            "file": item.get("filename"),
            "line": item.get("line_number"),
            "code": item.get("test_id"),
            "message": (item.get("issue_text") or "").strip(),
        })
    return findings


def _parse_mypy(stdout: str) -> list[dict]:
    """mypy default format: path:line: error|note: message  [error-code]"""
    findings = []
    for raw_line in stdout.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("Found ") or line.startswith("Success:"):
            continue
        parts = line.split(":", 3)
        if len(parts) < 4:
            continue
        file_path, line_no, level, rest = parts
        level = level.strip()
        if level not in ("error", "warning", "note"):
            continue
        rest = rest.strip()
        code = level
        if rest.endswith("]") and "[" in rest:
            bracket_start = rest.rfind("[")
            code = rest[bracket_start + 1:-1]
            rest = rest[:bracket_start].strip()
        findings.append({
            "tool": "mypy",
            "severity": "error" if level == "error" else "warning",
            "file": file_path.strip(),
            "line": int(line_no) if line_no.strip().isdigit() else None,
            "code": code,
            "message": rest,
        })
    return findings


def _parse_ruff(stdout: str) -> list[dict]:
    """ruff check --output-format=json"""
    findings = []
    try:
        data = json.loads(stdout or "[]")
    except json.JSONDecodeError:
        return findings
    for item in data:
        location = item.get("location") or {}
        findings.append({
            "tool": "ruff",
            "severity": "warning",
            "file": item.get("filename"),
            "line": location.get("row"),
            "code": item.get("code"),
            "message": (item.get("message") or "").strip(),
        })
    return findings


def _parse_pip_audit(stdout: str) -> list[dict]:
    """pip-audit -f json output. Flags known-vulnerable dependency versions
    from requirements.txt against the OSV database. Requires network
    access (SANDBOX_NETWORK_MODE must not be "none") -- if the sandbox has
    no network this call fails and yields zero findings rather than a
    false "clean" result (see the command's own guard in linter_registry).
    """
    findings = []
    try:
        data = json.loads(stdout or "{}")
    except json.JSONDecodeError:
        return findings
    # pip-audit's schema: {"dependencies": [{"name","version","vulns":[...]}]}
    for dep in data.get("dependencies", []):
        vulns = dep.get("vulns") or []
        for vuln in vulns:
            fix_versions = vuln.get("fix_versions") or []
            message = (vuln.get("description") or "").strip()
            if fix_versions:
                message = f"{message} (fix: upgrade to {', '.join(fix_versions)})".strip()
            findings.append({
                "tool": "pip-audit",
                "severity": "high",
                "file": "requirements.txt",
                "line": None,
                "code": vuln.get("id"),
                "message": message or f"Known vulnerability in {dep.get('name')} {dep.get('version')}",
            })
    return findings


PYTHON_LINTERS = [
    {
        "name": "flake8",
        "command": "pip install --quiet flake8 && flake8 --max-line-length=120 .",
        "parser": _parse_flake8,
    },
    {
        "name": "bandit",
        "command": "pip install --quiet bandit && bandit -r -q -f json .",
        "parser": _parse_bandit,
    },
    {
        "name": "mypy",
        "command": "pip install --quiet mypy && mypy --ignore-missing-imports .",
        "parser": _parse_mypy,
    },
    {
        "name": "ruff",
        "command": "pip install --quiet ruff && ruff check --output-format=json .",
        "parser": _parse_ruff,
    },
    {
        "name": "pip-audit",
        # Skips cleanly (empty JSON array output) if there's no
        # requirements.txt, rather than erroring the whole phase -- same
        # honest-gap pattern as the other linters here.
        "command": (
            "[ -f requirements.txt ] && "
            "pip install --quiet pip-audit && "
            "pip-audit -r requirements.txt -f json --progress-spinner=off "
            "|| echo '{\"dependencies\": []}'"
        ),
        "parser": _parse_pip_audit,
    },
]

LINTERS_BY_LANGUAGE: dict[str, list[dict]] = {
    "Python": PYTHON_LINTERS,
}