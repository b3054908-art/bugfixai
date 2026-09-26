"""Mirrors: backend/src/modules/analysis/pipeline/phase-manager.ts

Pipeline v2 (10-phase architecture). Matches the frontend design reference
1:1 (frontend/src/data/mockData.ts pipelinePhases) so PipelinePhase.number
lines up with what the dashboard renders phase-for-phase.

Reused from the old 8-phase engine (see pipeline_runner.py history):
  - Phase 1 Project Input   <- old phase 1, unchanged
  - Phase 2 Project Setup   <- old phase 2, unchanged
  - Phase 7 Isolated Environment <- old phase 3 (_run_phase3_sandbox_check),
    moved from position 3 to position 7. Repurposed: it now provisions the
    sandbox used to install/build/run the AI-patched workspace, not to
    discover errors from a first run.
  - Phase 8 Install->Build->Run&Test <- old phases 4+5 (build/test), now
    merged into one phase and followed by a Preview Checkpoint pause.
  - Phase 5 AI Root Cause Analysis <- old phase 7, same underlying AI call.
  - Phase 6 AI Patch Generation <- old phase 8's proposal-generation half.
  - Phase 9 Regression Check <- old phase 8's validation half, now scoped
    to a full regression pass (not just the changed files).

Net-new (nothing to reuse):
  - Phase 3 Static Analysis: deterministic linters, zero AI cost.
  - Phase 4 Error & Evidence Collection: now runs pre-build, fed by phase 3
    findings + any previously logged bugs (see honest gap note below).
  - Phase 10 Validation & Iteration: the loop controller (max-attempt cap,
    same-error fingerprint short-circuit, PASS/FAIL branching).
"""

PIPELINE_DEFINITIONS = [
    {
        "number": 1,
        "name": "Project Input",
        "description": "ZIP upload, Git repo, context docs (txt/md/pdf) & zero-trust security validation",
    },
    {
        "number": 2,
        "name": "Project Setup",
        "description": "Extract directory, detect language, framework, dependencies, entry point & verify context",
    },
    {
        "number": 3,
        "name": "Static Analysis",
        "description": "Zero-AI deterministic AST linters (flake8, ruff, bandit, eslint) in lightweight container",
    },
    {
        "number": 4,
        "name": "Error & Evidence Collection",
        "description": "Merge compiler logs, static analysis findings, stack traces & loop iteration state",
    },
    {
        "number": 5,
        "name": "AI Root Cause Analysis",
        "description": "Deep reasoning LLM investigates root cause, contract breach & blast radius",
    },
    {
        "number": 6,
        "name": "AI Patch Generation",
        "description": "Synthesize minimal unified diff patch [Shows OLD vs NEW diff if loop iteration]",
    },
    {
        "number": 7,
        "name": "Isolated Environment",
        "description": "Create isolated Docker sandbox container & configure database sidecar (Postgres/MySQL) network + env vars for Phase 8",
    },
    {
        "number": 8,
        "name": "Install \u2192 Build \u2192 Run & Test",
        "description": "Execute install, build pyc/wheels, run app daemon, run unit tests & fire Preview Checkpoint",
    },
    {
        "number": 9,
        "name": "Regression Check",
        "description": "Execute full test suite, integration harness, concurrency & OpenAPI contract verification",
    },
    {
        "number": 10,
        "name": "Validation & Iteration",
        "description": "Evaluate pass/fail result; branch to Final Report or Manual/Automatic Retry Loop",
    },
]