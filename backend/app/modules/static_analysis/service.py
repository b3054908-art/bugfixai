"""Mirrors: backend/src/modules/static-analysis/static-analysis.service.ts

Phase 3: Static Analysis. Zero-AI-cost, deterministic linters, run inside
the same sandbox mechanism as build/test (see modules/sandbox). Consumed
by pipeline_runner.py's Phase 3 block, which expects a dict shaped like:

    {
        "supported": bool,
        "tools": [{"name": str, "issueCount": int, "durationMs": int}, ...],
        "findings": [{"tool", "severity", "file", "line", "code", "message"}, ...],
    }

HONEST GAP: only Python has real linters registered (see
linter_registry.LINTERS_BY_LANGUAGE) -- any other language falls through
to the unsupported branch below rather than fabricating results, matching
the honest-gap pattern already used for GitHub sourcing in
pipeline_runner.py.
"""
from app.modules.sandbox.sandbox_service import run_sandbox
from app.modules.static_analysis.linter_registry import LINTERS_BY_LANGUAGE


async def run_static_analysis(work_root: str, language: str | None) -> dict:
    linters = LINTERS_BY_LANGUAGE.get(language or "", [])
    if not linters:
        return {"supported": False, "tools": [], "findings": []}

    tools: list[dict] = []
    findings: list[dict] = []

    for linter in linters:
        result = await run_sandbox(work_root, linter["command"], language)
        # A linter's non-zero exit code (e.g. flake8/bandit/mypy/ruff all
        # exit non-zero when they find issues) is expected and not a
        # pipeline failure -- only its parsed findings matter here.
        tool_findings = linter["parser"](result.stdout)
        for finding in tool_findings:
            finding["tool"] = linter["name"]
            findings.append(finding)
        tools.append({
            "name": linter["name"],
            "issueCount": len(tool_findings),
            "durationMs": result.duration_ms,
        })

    return {"supported": True, "tools": tools, "findings": findings}