"""Mirrors: backend/src/jobs/analysis.worker.ts

Pipeline v2 (10-phase architecture). Execution order now matches
phase_manager.PIPELINE_DEFINITIONS / the frontend dashboard exactly:

  1. Project Input              <- unchanged from the 8-phase engine
  2. Project Setup               <- unchanged from the 8-phase engine
  3. Static Analysis              REAL (Job 1: modules/static_analysis)
  4. Error & Evidence Collection  REUSED, moved from old #6 -> #4. Now only
     sees Phase 3's static-analysis findings (build/test hasn't run yet at
     this point in the new order) -- honest scope-down, see Job 3 note below.
  5. AI Root Cause Analysis       REUSED, moved from old #7 -> #5
  6. AI Patch Generation          STUB for now (Job 4): reports the same
     FixProposals phase 5 already generated rather than a second AI call.
  7. Isolated Environment         REUSED, moved from old #3 -> #7
  8. Install -> Build -> Run & Test  REUSED (old #4 build + #5 test merged).
     Preview Checkpoint pause/resume NOT wired yet -- runs straight through
     (Job 5).
  9. Regression Check             STUB for now (Job 5): reuses the old
     disposable-workspace validation as a placeholder.
  10. Validation & Iteration      STUB for now (Job 6): no loop controller
     yet, run always completes after one pass -- no retry, no FixAttempt
     rows created yet.

HONEST GAP: GitHub-sourced projects (sourceType == GITHUB) still fail with
a clear error at Phase 1 -- unchanged from before, not part of this rewrite.
"""
import asyncio
import os
import shutil
import tempfile
import time
from datetime import datetime, timezone

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.websocket.realtime_gateway import REALTIME_EVENTS, RealtimeGateway
from app.models.analysis import AnalysisRun, PipelinePhase
from app.models.bug import Bug, ErrorRecord
from app.models.enums import AIStatus, BugStatus
from app.models.fix import FixProposal, TestRun
from app.models.loop import FixAttempt, PreviewCheckpoint
from app.models.context import Workspace
from app.models.enums import AnalysisStatus, PhaseStatus, ProjectStatus, SourceType
from app.models.enums import FixAttemptMode, FixAttemptResult, Provider
from app.models.enums import CheckpointStatus
from app.models.enums import ValidationStatus
from app.modules.fixes.service import generate_fix
from app.modules.ai.service import diagnose_root_cause, generate_patch
from app.modules.fixes.patch_service import apply_simple_replacement, count_added_removed_lines, count_changed_lines, read_workspace_file, write_workspace_file
from app.modules.fixes.validation_service import validate_workspace
from app.models.project import Project
from app.modules.analysis.detectors import detect_build_command, detect_preview, detect_test_command
from app.modules.analysis.phase_manager import PIPELINE_DEFINITIONS
from app.modules.analysis.pipeline_service import add_log, set_security_report, set_subprocesses, set_validation_report
from app.modules.code_analysis.project_inspector import inspect_project
from app.modules.sandbox.db_sidecar import start_database_sidecar, stop_database_sidecar
from app.modules.sandbox.container_manager import (
    start_preview_container, stop_preview_container, is_container_running, get_container_logs,
)
from app.modules.static_analysis.service import run_static_analysis
from app.modules.bugs.service import create_bug_from_error
from app.modules.errors.error_collector import fingerprint, record_error
from app.modules.errors.test_result_parser import parse_generic_test_output, categorize_test_output
from app.modules.sandbox.sandbox_service import run_sandbox
from app.modules.uploads.security_scanner import run_security_scan
from app.modules.uploads.zip_extractor import extract_archive
from app.models.context import ContextDocument


class PipelineError(Exception):
    pass


def _command_failure_detail(result) -> str:
    """Combine stdout + stderr into one labeled string for error messages.

    Docker prints image-pull noise ("Unable to find image ... Pulling from
    library/python ... Status: Downloaded newer image") to stderr on a cold
    pull, while the actual tool output (e.g. python -m compileall's
    SyntaxError) goes to stdout. Reading stderr alone shows the Docker noise
    and hides the real error. This surfaces both, stdout first since that's
    almost always where the actual failure detail lives.
    """
    stdout = (result.stdout or "").strip()
    stderr = (result.stderr or "").strip()
    parts = []
    if stdout:
        parts.append(f"--- stdout ---\n{stdout}")
    if stderr:
        parts.append(f"--- stderr ---\n{stderr}")
    if not parts:
        return "(command produced no output)"
    return "\n".join(parts)


def _zip_phase1_subprocesses() -> list[dict]:
    """Real steps for a local ZIP/TAR upload. Step 0 is already true by the
    time the pipeline reaches Phase 1 — validate_archive() + checksum ran
    during the upload request itself (uploads/service.py)."""
    return [
        {"id": "source_received", "name": "Archive integrity & quota verified", "completed": True, "status": "completed", "category": "upload"},
        {"id": "extract_workspace", "name": "Extract archive into sandbox workspace", "completed": False, "status": "pending", "category": "extract"},
        {"id": "workspace_ready", "name": "Workspace ready for inspection", "completed": False, "status": "pending", "category": "extract"},
    ]


def _github_phase1_subprocesses() -> list[dict]:
    """Real steps for a GitHub-sourced project. None of these are implemented
    in the pipeline yet (see HONEST GAP note above) — shown as a checklist so
    the modal reflects the truth instead of faking progress."""
    return [
        {"id": "token_verified", "name": "GitHub connector authorization verified", "completed": False, "status": "pending", "category": "github"},
        {"id": "repo_resolved", "name": "Repository & branch resolved", "completed": False, "status": "pending", "category": "github"},
        {"id": "clone_repo", "name": "Clone repository into workspace", "completed": False, "status": "pending", "category": "github"},
        {"id": "workspace_ready", "name": "Workspace ready for inspection", "completed": False, "status": "pending", "category": "github"},
    ]


async def _set_phase_status(db: AsyncSession, phase: PipelinePhase, status: PhaseStatus) -> None:
    now = datetime.now(timezone.utc)
    phase.status = status
    if status == PhaseStatus.RUNNING:
        phase.startedAt = now
    else:
        phase.completedAt = now
        if phase.startedAt:
            phase.durationMs = int((now - phase.startedAt.replace(tzinfo=timezone.utc)).total_seconds() * 1000)
    await db.commit()
    await db.refresh(phase)


async def _update_phase_step(
    db: AsyncSession,
    gateway: RealtimeGateway,
    analysis_id: str,
    project_id: str,
    phase: PipelinePhase,
    steps: list[dict],
    step_id: str,
    status: str,
    metrics: dict[str, str] | None = None,
) -> None:
    """Persist and broadcast one real mechanism step as it changes state."""
    step = next(item for item in steps if item["id"] == step_id)
    step["status"] = status
    step["completed"] = status == "completed"
    if metrics:
        step["metrics"] = metrics
    await set_subprocesses(db, gateway, analysis_id, project_id, phase, steps)


def _phase_steps(items: list[tuple[str, str, str]]) -> list[dict]:
    return [
        {"id": step_id, "name": name, "completed": False, "status": "pending", "category": category}
        for step_id, name, category in items
    ]


async def _check_application_starts(
    db: AsyncSession,
    gateway: RealtimeGateway,
    analysis_id: str,
    project_id: str,
    project: Project,
    phase: PipelinePhase,
    work_root: str,
    language: str,
    subprocesses: list[dict],
) -> None:
    """Phase 8 (Job: 'Start application'). Best-effort, same honesty level
    as detect_preview() itself: not every project is a long-running web
    server, so a project with no previewCommand (Phase 2 couldn't detect
    one) SKIPS this step rather than failing it -- there's nothing to
    start. This deliberately does NOT raise PipelineError on a crash: a
    project failing to boot as a live server is real signal worth a Bug,
    but treating it as fatal would block Phase 8's actual test run even
    for projects that are libraries/CLIs with previewCommand=None, or
    where the preview guess itself was wrong (see detect_preview's own
    caveat about host="0.0.0.0" binding)."""
    if not project.previewCommand:
        await _update_phase_step(db, gateway, analysis_id, project_id, phase, subprocesses, "start_application", "completed",
                                  {"result": "skipped — no runnable entrypoint detected for this project"})
        return

    await _update_phase_step(db, gateway, analysis_id, project_id, phase, subprocesses, "start_application", "running")
    container_name = f"bugfixer-startcheck-{analysis_id}"
    started = await start_preview_container(work_root, project.previewCommand, language, project.previewPort or 8000, container_name)

    if not started.get("ok"):
        # Exited immediately -- container_manager already tried `docker port`
        # and failed, meaning the process never bound anything.
        error = await record_error(
            db, project_id, f"Application failed to start: {project.previewCommand}",
            analysis_run_id=analysis_id, name="AppStartError", stack_trace=started.get("error", ""),
            source="runtime",
        )
        await create_bug_from_error(db, project, error)
        await _update_phase_step(db, gateway, analysis_id, project_id, phase, subprocesses, "start_application", "failed",
                                  {"error": started.get("error", "")[:300]})
        await add_log(db, gateway, analysis_id, project_id, "ERROR", "Start Application",
                      f"App failed to start: {started.get('error', '')[:2000]}", phase.id, phase.number)
        return

    try:
        # Give it a moment to crash on boot before we call it "started" --
        # a container can be `docker run -d` successfully and still crash
        # a second later (e.g. an unhandled exception right after bind()).
        await asyncio.sleep(3)
        still_running = await is_container_running(container_name)
        logs = await get_container_logs(container_name)

        if still_running:
            await _update_phase_step(db, gateway, analysis_id, project_id, phase, subprocesses, "start_application", "completed",
                                      {"hostPort": str(started.get("hostPort")), "logsBytes": str(len(logs))})
            await add_log(db, gateway, analysis_id, project_id, "PASS", "Start Application",
                          f"Application started and stayed up ({project.previewCommand})", phase.id, phase.number)
        else:
            error = await record_error(
                db, project_id, f"Application crashed shortly after starting: {project.previewCommand}",
                analysis_run_id=analysis_id, name="AppRuntimeError", stack_trace=logs,
                source="runtime",
            )
            await create_bug_from_error(db, project, error)
            await _update_phase_step(db, gateway, analysis_id, project_id, phase, subprocesses, "start_application", "failed",
                                      {"logsBytes": str(len(logs))})
            await add_log(db, gateway, analysis_id, project_id, "ERROR", "Start Application",
                          f"App crashed after starting: {logs[:2000]}", phase.id, phase.number)
    finally:
        await stop_preview_container(container_name)


async def _run_isolated_environment(
    db: AsyncSession,
    gateway: RealtimeGateway,
    analysis_id: str,
    project_id: str,
    phase: PipelinePhase,
    work_root: str,
    language: str | None,
) -> None:
    """Phase 7: create and exercise the sandbox used by Phase 8's
    install/build/run/test. REUSED from the old 8-phase engine's Phase 3
    (_run_phase3_sandbox_check) -- same function body, moved and renamed to
    match its new position, since old-Phase-3-immediately-before-Build is
    the same relative slot as new-Phase-7-immediately-before-Phase-8."""
    result = await run_sandbox(work_root, "test -d /workspace && printf sandbox-ready", language)
    subprocesses = [{
        "id": "sandbox_smoke_test",
        "name": "Create isolated execution sandbox",
        "completed": result.code == 0,
        "status": "completed" if result.code == 0 else "failed",
        "category": "sandbox",
        "metrics": {"durationMs": str(result.duration_ms), "output": result.stdout.strip()},
    }]
    await set_subprocesses(db, gateway, analysis_id, project_id, phase, subprocesses)
    if result.code != 0:
        detail = _command_failure_detail(result)
        error = await record_error(
            db, project_id, "Sandbox initialization failed", analysis_run_id=analysis_id,
            name="SandboxError", stack_trace=detail, source="sandbox",
        )
        await create_bug_from_error(db, await db.get(Project, project_id), error)
        raise PipelineError(f"Sandbox initialization failed: {detail[:2000]}")


async def _collect_run_errors(
    db: AsyncSession,
    analysis_id: str,
    project_id: str,
) -> tuple[list[ErrorRecord], list[Bug]]:
    """Phase 4 evidence set -- STATIC-ONLY DESIGN (confirmed, Job 3): this
    run has no build/test output yet (that happens later, at Phase 8), so
    evidence is exactly two things:
      1. This run's own ErrorRecord rows -- right now exclusively Phase 3
         static-analysis findings. create_bug_from_error() already turned
         each one into a Bug (or a BugOccurrence on an existing one) when
         Phase 3 recorded it, so nothing here creates anything new.
      2. Any bug the user already logged by hand via "Log Bug" (Bug rows
         with analysisRunId IS NULL, i.e. not tied to any prior run) that's
         still open -- these get diagnosed alongside this run's own
         findings without being reassigned to this run, so a bug's
         analysisRunId still honestly reflects where it was first found.
    """
    errors_stmt = select(ErrorRecord).where(
        ErrorRecord.analysisRunId == analysis_id,
        ErrorRecord.projectId == project_id,
    )
    errors = list((await db.execute(errors_stmt)).scalars().all())

    logged_bugs_stmt = select(Bug).where(
        Bug.projectId == project_id,
        Bug.analysisRunId.is_(None),
        Bug.status.in_((BugStatus.Open, BugStatus.InReview, BugStatus.AISuggested)),
    )
    logged_bugs = list((await db.execute(logged_bugs_stmt)).scalars().all())

    return errors, logged_bugs


async def _report_phase8_errors_to_phase4(
    db: AsyncSession,
    gateway: RealtimeGateway,
    analysis_id: str,
    project_id: str,
    phase4: PipelinePhase | None,
) -> None:
    """Error finder (Phase 8 -> Phase 4): Phase 4 runs before Phase 8 in
    pipeline order, so its evidence set is normally frozen at Phase 3's
    static findings (see the STATIC-ONLY docstring on _collect_run_errors).
    This re-runs that same collector now that Phase 8 has actually executed,
    so Phase 4's evidence set and UI/log reflect every build/runtime/test
    error Phase 8 found -- not just static analysis.

    Merge only, by design (Job: error finder, option 1): this does NOT
    change what Phase 5 / the retry loop diagnose from -- that still reads
    its own direct feed unchanged. This just makes Phase 4 honestly show
    the full picture after the fact.
    """
    if phase4 is None:
        return

    errors, logged_bugs = await _collect_run_errors(db, analysis_id, project_id)
    phase8_sourced = [e for e in errors if e.source in ("build", "runtime", "test")]

    steps = list(phase4.subprocesses or [])
    steps.append({
        "id": "phase8_errors_merged",
        "name": "Merge Phase 8 build/runtime/test errors",
        "completed": True,
        "status": "completed",
        "category": "errors",
        "metrics": {
            "phase8Errors": str(len(phase8_sourced)),
            "totalEvidence": str(len(errors) + len(logged_bugs)),
        },
    })
    await set_subprocesses(db, gateway, analysis_id, project_id, phase4, steps)

    if phase8_sourced:
        await add_log(
            db, gateway, analysis_id, project_id, "INFO", "Error & Evidence Collection",
            f"Phase 8 reported {len(phase8_sourced)} error(s) (build/runtime/test) — "
            f"evidence set now totals {len(errors)} error(s) + {len(logged_bugs)} logged bug(s)",
            phase4.id, phase4.number,
        )
    else:
        await add_log(
            db, gateway, analysis_id, project_id, "PASS", "Error & Evidence Collection",
            "Phase 8 completed clean — no build/runtime/test errors to merge",
            phase4.id, phase4.number,
        )


async def _bugs_in_scope_for_run(db: AsyncSession, project_id: str, analysis_id: str) -> list[Bug]:
    """Shared bug-selection query for Phase 5/6: bugs this run's Phase 3
    static analysis found (analysisRunId == this run) plus any still-open
    bug the user logged by hand and that hasn't been claimed by a prior run
    (analysisRunId IS NULL) -- matches the Phase 4 static-only evidence set."""
    stmt = select(Bug).where(
        Bug.projectId == project_id,
        Bug.status.in_((BugStatus.Open, BugStatus.InReview, BugStatus.AISuggested)),
        or_(Bug.analysisRunId == analysis_id, Bug.analysisRunId.is_(None)),
    )
    return list((await db.execute(stmt)).scalars().all())


async def _diagnose_run_bugs(
    db: AsyncSession,
    gateway: RealtimeGateway,
    project: Project,
    analysis_id: str,
    phase: PipelinePhase,
    subprocesses: list[dict],
) -> dict[str, dict]:
    """Phase 5: AI Root Cause Analysis. Job 4's first of two real, separate
    AI calls -- diagnosis only, no patch yet. Returns {bug_id: diagnosis}
    so Phase 6 can read each bug's settled diagnosis back out of the same
    run_analysis_pipeline() call (both phases execute in one function, one
    loop, so this dict just lives as a local variable between them).

    Drives the phase's 4 visible sub-process steps (understand_error /
    trace_relevant_code / determine_root_cause / determine_impact) off the
    real per-bug checkpoints diagnose_root_cause fires -- each step ticks
    to "running" with a live N/total count as bugs pass that checkpoint,
    and flips to "completed" once every bug in scope has."""
    bugs = await _bugs_in_scope_for_run(db, project.id, analysis_id)
    total = len(bugs)
    step_ids = ("understand_error", "trace_relevant_code", "determine_root_cause", "determine_impact")

    if total == 0:
        for step_id in step_ids:
            await _update_phase_step(db, gateway, analysis_id, project.id, phase, subprocesses, step_id,
                                      "completed", {"bugs": "0/0"})
        return {}

    counts = {step_id: 0 for step_id in step_ids}

    def _ticker(step_id: str):
        async def _tick() -> None:
            counts[step_id] += 1
            status = "completed" if counts[step_id] >= total else "running"
            await _update_phase_step(db, gateway, analysis_id, project.id, phase, subprocesses, step_id, status,
                                      {"bugs": f"{counts[step_id]}/{total}"})
        return _tick

    diagnoses: dict[str, dict] = {}
    for bug in bugs:
        diagnoses[bug.id] = await diagnose_root_cause(
            db, project.ownerId, project.id, bug.id, None, None,
            on_understand=_ticker("understand_error"),
            on_trace=_ticker("trace_relevant_code"),
            on_root_cause=_ticker("determine_root_cause"),
            on_impact=_ticker("determine_impact"),
        )
    return diagnoses


async def _generate_run_patches(
    db: AsyncSession,
    project: Project,
    analysis_id: str,
    diagnoses: dict[str, dict],
) -> list[FixProposal]:
    """Phase 6: AI Patch Generation. Job 4's second real AI call -- patch
    synthesis grounded in Phase 5's settled diagnosis. Also creates the
    first FixAttempt row per bug (attemptNumber=1, previousAttemptId=None):
    the loop controller that creates attempt 2+ on a failed validation is
    Job 6's job, not this one -- this just makes sure attempt 1 always
    exists so the frontend's FixAttempt history isn't empty from run one."""
    fixes: list[FixProposal] = []
    for bug_id, diagnosis in diagnoses.items():
        bug = await db.get(Bug, bug_id)
        patch = await generate_patch(db, project.ownerId, project.id, bug_id, diagnosis, diagnosis["provider"], diagnosis["model"])

        root_cause = diagnosis.get("rootCause", "")
        explanation = f"Root cause: {root_cause}\n\n{diagnosis['explanation']}" if root_cause else diagnosis["explanation"]

        fix = FixProposal(
            bugId=bug.id,
            projectId=project.id,
            analysisRunId=analysis_id,
            provider=Provider(patch["provider"]),
            model=patch["model"],
            confidence=diagnosis["confidence"],
            explanation=explanation,
            patchSummary=patch["patchSummary"],
            unifiedDiff=patch["unifiedDiff"],
            originalCode=patch.get("originalCode"),
            proposedCode=patch.get("proposedCode"),
            affectedFiles=diagnosis["affectedFiles"],
            linesChanged=count_changed_lines(patch["unifiedDiff"]),
            estimatedMinutes=patch["estimatedMinutes"],
        )
        db.add(fix)
        bug.aiStatus = AIStatus.Ready
        bug.status = BugStatus.AISuggested
        await db.commit()
        await db.refresh(fix)

        added, removed = count_added_removed_lines(patch["unifiedDiff"])
        db.add(FixAttempt(
            bugId=bug.id,
            analysisRunId=analysis_id,
            attemptNumber=1,
            mode=FixAttemptMode.automatic,
            fixProposalId=fix.id,
            diffSnippet=patch["unifiedDiff"][:8000],
            resultStatus=FixAttemptResult.pending,
            linesAdded=added,
            linesRemoved=removed,
        ))
        await db.commit()

        fixes.append(fix)
    return fixes


async def _run_regression_validation(
    db: AsyncSession,
    project: Project,
    fixes: list[FixProposal],
) -> dict[str, dict]:
    """Phase 9: validates each fix in a disposable workspace copy (never
    live source). Returns {bug_id: {"passed": bool, "stdout": str, "stderr": str}}
    -- Phase 10's loop controller reads this to know which bugs need a retry."""
    if not project.workspacePath:
        raise PipelineError("Workspace is not initialized for patch validation")

    command = await detect_test_command(project.workspacePath, project.language or "Unknown")
    results: dict[str, dict] = {}
    for fix in fixes:
        if not fix.originalCode or not fix.proposedCode or len(fix.affectedFiles) != 1:
            results[fix.bugId] = {
                "passed": False, "stdout": "", "stderr": "Patch has no single-file safe replacement context to validate",
            }
            continue
        temporary_root = tempfile.mkdtemp(prefix="bugfix-validation-")
        try:
            shutil.copytree(project.workspacePath, temporary_root, dirs_exist_ok=True)
            file_path = fix.affectedFiles[0]
            current = await read_workspace_file(temporary_root, file_path)
            updated = apply_simple_replacement(current, fix.originalCode, fix.proposedCode)
            await write_workspace_file(temporary_root, file_path, updated)
            outcome = await validate_workspace(db, project.id, fix.id, temporary_root, command)
            passed = outcome["validation"].status == ValidationStatus.PASSED
            results[fix.bugId] = {"passed": passed, "stdout": outcome["stdout"], "stderr": outcome["stderr"]}
        finally:
            shutil.rmtree(temporary_root, ignore_errors=True)
    return results


async def _retry_bug_until_pass_or_exhausted(
    db: AsyncSession,
    gateway: RealtimeGateway,
    analysis_id: str,
    project_id: str,
    project: Project,
    bug: Bug,
    latest_attempt: FixAttempt,
    max_attempts: int,
) -> str:
    """Phase 10's actual loop (Job 6): re-diagnoses, re-patches, and
    re-validates one failing bug, up to max_attempts total attempts.
    Stops early if two consecutive attempts fail with the identical error
    fingerprint -- the same-error guard from the frontend design, since
    regenerating a patch that keeps failing the exact same way burns
    attempts without making progress. Returns "passed", "same_error", or
    "exhausted"."""
    current_attempt = latest_attempt
    while current_attempt.attemptNumber < max_attempts:
        next_attempt_number = current_attempt.attemptNumber + 1

        # Fresh diagnosis, not the stale one from earlier this run -- the
        # bug just failed validation, which is new evidence the first
        # diagnosis didn't have.
        diagnosis = await diagnose_root_cause(db, project.ownerId, project.id, bug.id, None, None)
        patch = await generate_patch(db, project.ownerId, project.id, bug.id, diagnosis, diagnosis["provider"], diagnosis["model"])

        root_cause = diagnosis.get("rootCause", "")
        explanation = f"Root cause: {root_cause}\n\n{diagnosis['explanation']}" if root_cause else diagnosis["explanation"]
        new_fix = FixProposal(
            bugId=bug.id, projectId=project.id, analysisRunId=analysis_id,
            provider=Provider(patch["provider"]), model=patch["model"],
            confidence=diagnosis["confidence"], explanation=explanation,
            patchSummary=patch["patchSummary"], unifiedDiff=patch["unifiedDiff"],
            originalCode=patch.get("originalCode"), proposedCode=patch.get("proposedCode"),
            affectedFiles=diagnosis["affectedFiles"], linesChanged=count_changed_lines(patch["unifiedDiff"]),
            estimatedMinutes=patch["estimatedMinutes"],
        )
        db.add(new_fix)
        await db.commit()
        await db.refresh(new_fix)

        added, removed = count_added_removed_lines(patch["unifiedDiff"])
        new_attempt = FixAttempt(
            bugId=bug.id, analysisRunId=analysis_id, attemptNumber=next_attempt_number,
            mode=FixAttemptMode.automatic, previousAttemptId=current_attempt.id,
            fixProposalId=new_fix.id, diffSnippet=patch["unifiedDiff"][:8000],
            resultStatus=FixAttemptResult.pending, linesAdded=added, linesRemoved=removed,
        )
        db.add(new_attempt)
        await db.commit()

        result = (await _run_regression_validation(db, project, [new_fix])).get(bug.id)
        if result is None:
            return "exhausted"

        if result["passed"]:
            new_attempt.resultStatus = FixAttemptResult.pass_
            await db.commit()
            await add_log(db, gateway, analysis_id, project_id, "PASS", "Validation & Iteration",
                          f"Bug fixed on retry attempt #{next_attempt_number} ({bug.id})")
            return "passed"

        new_fingerprint = fingerprint(result["stderr"] or result["stdout"] or "validation failed")
        new_attempt.resultStatus = FixAttemptResult.fail
        new_attempt.errorFingerprint = new_fingerprint
        new_attempt.rawErrorOutput = (result["stderr"] or result["stdout"])[:8000]
        await db.commit()

        if current_attempt.errorFingerprint and current_attempt.errorFingerprint == new_fingerprint:
            await add_log(db, gateway, analysis_id, project_id, "WARN", "Validation & Iteration",
                          f"Attempt #{next_attempt_number} failed with the same error as the previous "
                          f"attempt — stopping retries for this bug ({bug.id})")
            return "same_error"

        current_attempt = new_attempt

    return "exhausted"


async def run_analysis_pipeline(
    db: AsyncSession,
    gateway: RealtimeGateway,
    analysis_id: str,
    project_id: str,
    start_from_phase: int = 1,
) -> None:
    """start_from_phase (Job 5): 1 for a fresh run. When resuming from the
    Phase 8 Preview Checkpoint, resume_analysis_pipeline() calls this with
    start_from_phase=9 so phases 1-8 (already COMPLETED in the DB from the
    first pass) are skipped rather than re-executed."""
    run_stmt = (
        select(AnalysisRun)
        .where(AnalysisRun.id == analysis_id)
    )
    run = (await db.execute(run_stmt)).scalar_one_or_none()
    if run is None:
        raise PipelineError("Analysis run not found")

    project = await db.get(Project, project_id)
    if project is None:
        raise PipelineError("Project not found")

    phases_stmt = select(PipelinePhase).where(PipelinePhase.analysisRunId == analysis_id)
    phases = {p.number: p for p in (await db.execute(phases_stmt)).scalars().all()}

    run.status = AnalysisStatus.RUNNING
    if start_from_phase == 1:
        run.startedAt = datetime.now(timezone.utc)
    await db.commit()

    if start_from_phase == 1:
        await gateway.publish(
            project_id,
            {"type": "analysis.started", "projectId": project_id, "analysisId": analysis_id, "payload": {"analysisId": analysis_id}},
        )
    else:
        await gateway.publish(
            project_id,
            {"type": "analysis.resumed", "projectId": project_id, "analysisId": analysis_id, "payload": {"analysisId": analysis_id, "resumedFromPhase": start_from_phase}},
        )

    work_root = os.path.abspath(os.path.join("sandbox-work", project_id, analysis_id))
    current_phase: PipelinePhase | None = None
    # Phase 5 -> Phase 6 handoff: both blocks run inside this same function
    # call's loop, so a plain local dict is enough to pass each bug's
    # settled diagnosis from Phase 5 into Phase 6 without a DB round trip.
    # NOTE: on a resumed run (start_from_phase=9) this stays empty, since
    # Phase 5/6 already ran and completed in the first pass -- nothing
    # currently re-reads it after a resume, so this is safe as-is.
    run_diagnoses: dict[str, dict] = {}
    # Phase 9 -> Phase 10 handoff, same pattern as run_diagnoses above.
    run_regression_results: dict[str, dict] = {}
    # Phase 7 -> Phase 8 handoff: the sidecar (if any) is provisioned in
    # Phase 7 and consumed by Phase 8's install/build/run/test commands.
    # On a resumed run (start_from_phase=9) this stays None in THIS call's
    # scope, but the container/network themselves are still running (they
    # were started by the original call and are only torn down at the
    # run's true terminal state below) -- Phase 9/10 don't currently need
    # to reach them since Phase 9's validation uses a separate, non-Docker
    # execution path (fixes/validation_service.py) that isn't wired to the
    # sidecar yet -- see NOTE at _run_regression_validation.
    db_sidecar: dict | None = None

    try:
        os.makedirs(work_root, exist_ok=True)

        for definition in PIPELINE_DEFINITIONS:
            if definition["number"] < start_from_phase:
                continue
            phase = phases.get(definition["number"])
            if phase is None:
                raise PipelineError(f"Missing pipeline phase {definition['number']}")
            current_phase = phase

            await _set_phase_status(db, phase, PhaseStatus.RUNNING)
            await gateway.publish(
                project_id,
                {"type": REALTIME_EVENTS["phase_started"], "projectId": project_id, "analysisId": analysis_id,
                 "payload": {"id": phase.id, "number": phase.number, "name": phase.name, "status": phase.status}},
            )
            await add_log(db, gateway, analysis_id, project_id, "INFO", definition["name"],
                          f"Starting {definition['name']}", phase.id, phase.number)

            # Phase 1: extract/clone project source
            if definition["number"] == 1:
                if project.sourceType == SourceType.GITHUB:
                    subprocesses = _github_phase1_subprocesses()
                    # First real step (repo cloning) is the honest failure point —
                    # nothing before it actually runs yet either, so we don't
                    # fake a tick on token/repo resolution.
                    subprocesses[2]["status"] = "failed"
                    subprocesses[2]["metrics"] = {"reason": "Not yet implemented in this build"}
                    await set_subprocesses(db, gateway, analysis_id, project_id, phase, subprocesses)
                    raise PipelineError(
                        "GitHub-sourced projects aren't supported yet in this build — "
                        "the GitHub integration module hasn't been ported. Upload a ZIP instead."
                    )
                if not project.sourcePath:
                    raise PipelineError("Project source archive is missing")

                subprocesses = _zip_phase1_subprocesses()
                await set_subprocesses(db, gateway, analysis_id, project_id, phase, subprocesses)

                await extract_archive(project.sourcePath, work_root)
                subprocesses[1]["completed"] = True
                subprocesses[1]["status"] = "completed"
                await set_subprocesses(db, gateway, analysis_id, project_id, phase, subprocesses)

                project.workspacePath = work_root
                ws_stmt = select(Workspace).where(Workspace.projectId == project_id)
                workspace = (await db.execute(ws_stmt)).scalar_one_or_none()
                if workspace:
                    workspace.rootPath = work_root
                else:
                    db.add(Workspace(projectId=project_id, rootPath=work_root))
                await db.commit()

                subprocesses[2]["completed"] = True
                subprocesses[2]["status"] = "completed"
                await set_subprocesses(db, gateway, analysis_id, project_id, phase, subprocesses)

                # Real Phase 1 security-check results (size/zip-bomb, malicious/junk
                # files, path traversal, magic-bytes/checksum, context docs) —
                # surfaced to the Inspector modal's Security & Sanitization tab.
                ext = os.path.splitext(project.sourcePath)[1].lower()
                archive_type = "zip" if ext == ".zip" else "tar"
                ctx_docs_stmt = select(ContextDocument.id).where(ContextDocument.projectId == project_id)
                context_doc_count = len((await db.execute(ctx_docs_stmt)).scalars().all())
                security_checks = await run_security_scan(
                    project.sourcePath, work_root, archive_type, context_doc_count
                )
                await set_security_report(db, gateway, analysis_id, project_id, phase, security_checks)
                await _update_phase_step(
                    db, gateway, analysis_id, project_id, phase, subprocesses,
                    "workspace_ready", "completed", {"securityChecks": str(len(security_checks))},
                )

            # Phase 2: detect language/framework
            if definition["number"] == 2:
                subprocesses = _phase_steps([
                    ("detect_language", "Detect project language", "inspection"),
                    ("detect_framework", "Detect project framework", "inspection"),
                    ("detect_dependencies", "Analyze project dependencies", "inspection"),
                    ("detect_database", "Detect expected database", "inspection"),
                    ("index_symbols", "Build source symbol index", "inspection"),
                ])
                await set_subprocesses(db, gateway, analysis_id, project_id, phase, subprocesses)
                await _update_phase_step(db, gateway, analysis_id, project_id, phase, subprocesses, "detect_language", "running")
                inspection = await inspect_project(work_root)
                await _update_phase_step(
                    db, gateway, analysis_id, project_id, phase, subprocesses, "detect_language", "completed",
                    {"language": inspection["language"]},
                )
                await _update_phase_step(
                    db, gateway, analysis_id, project_id, phase, subprocesses, "detect_framework", "completed",
                    {"framework": inspection["framework"]},
                )
                await _update_phase_step(
                    db, gateway, analysis_id, project_id, phase, subprocesses, "detect_dependencies", "completed",
                    {"runtime": str(len(inspection["dependencies"].get("runtime", {}))),
                     "development": str(len(inspection["dependencies"].get("development", {})))},
                )
                await _update_phase_step(
                    db, gateway, analysis_id, project_id, phase, subprocesses, "detect_database", "completed",
                    {"database": inspection["database"] or "none detected"},
                )
                await _update_phase_step(
                    db, gateway, analysis_id, project_id, phase, subprocesses, "index_symbols", "completed",
                    {"symbols": str(inspection["symbolCount"])},
                )
                project.language = inspection["language"]
                project.framework = inspection["framework"]
                project.entryPoint = inspection["entryPoint"]
                project.databaseType = inspection["database"]
                preview_command, preview_port = await detect_preview(work_root, inspection["language"], inspection["entryPoint"])
                project.previewCommand = preview_command
                project.previewPort = preview_port
                await db.commit()
                await add_log(db, gateway, analysis_id, project_id, "PASS", "Project Setup",
                              f"Detected {inspection['language']} with {inspection['framework']}", phase.id, phase.number)
                if inspection["database"]:
                    await add_log(db, gateway, analysis_id, project_id, "INFO", "Project Setup",
                                  f"Expects a {inspection['database']} database", phase.id, phase.number)
                if preview_command:
                    await add_log(db, gateway, analysis_id, project_id, "INFO", "Project Setup",
                                  f"Preview available: {preview_command} on port {preview_port}", phase.id, phase.number)

            # Phase 3: Static Analysis — REAL (Job 1). Zero-AI-cost linters,
            # run before the code is ever built/executed.
            if definition["number"] == 3:
                report = await run_static_analysis(work_root, project.language)
                subprocesses = [
                    {
                        "id": f"lint_{tool['name']}",
                        "name": f"Run {tool['name']}",
                        "completed": True,
                        "status": "completed",
                        "category": "static-analysis",
                        "metrics": {"issues": str(tool["issueCount"]), "durationMs": str(tool["durationMs"])},
                    }
                    for tool in report["tools"]
                ]
                if not report["supported"]:
                    subprocesses = [{
                        "id": "unsupported_language",
                        "name": f"No linters registered for {project.language or 'this language'} yet",
                        "completed": False,
                        "status": "pending",
                        "category": "static-analysis",
                    }]
                await set_subprocesses(db, gateway, analysis_id, project_id, phase, subprocesses)

                for finding in report["findings"]:
                    error = await record_error(
                        db, project_id, finding["message"] or finding["code"] or "Static analysis finding",
                        analysis_run_id=analysis_id, name=f"{finding['tool']}:{finding['code']}",
                        file_path=finding.get("file"), line_number=finding.get("line"),
                        source="static_analysis",
                    )
                    await create_bug_from_error(db, project, error)

                if report["supported"]:
                    await add_log(db, gateway, analysis_id, project_id, "PASS", "Static Analysis",
                                  f"{len(report['findings'])} finding(s) across {len(report['tools'])} linter(s)", phase.id, phase.number)
                else:
                    await add_log(db, gateway, analysis_id, project_id, "WARN", "Static Analysis",
                                  f"No linters registered for {project.language or 'this language'} yet — skipped", phase.id, phase.number)

            # Phase 4: Error & Evidence Collection — STATIC-ONLY DESIGN
            # (confirmed, Job 3). Evidence is Phase 3's static-analysis
            # findings for this run plus any bug the user already logged by
            # hand that's still open. Reused from old Phase 6
            # (_collect_run_errors), moved from #6 -> #4.
            if definition["number"] == 4:
                subprocesses = _phase_steps([
                    ("load_run_errors", "Load static-analysis errors from this run", "errors"),
                    ("load_logged_bugs", "Load previously logged, still-open bugs", "errors"),
                    ("fingerprint_errors", "Fingerprint and deduplicate errors", "errors"),
                    ("sync_bugs", "Confirm full evidence set is bug-tracked", "errors"),
                ])
                await set_subprocesses(db, gateway, analysis_id, project_id, phase, subprocesses)
                await _update_phase_step(db, gateway, analysis_id, project_id, phase, subprocesses, "load_run_errors", "running")
                errors, logged_bugs = await _collect_run_errors(db, analysis_id, project_id)
                await _update_phase_step(db, gateway, analysis_id, project_id, phase, subprocesses, "load_run_errors", "completed", {"errors": str(len(errors))})
                await _update_phase_step(db, gateway, analysis_id, project_id, phase, subprocesses, "load_logged_bugs", "completed", {"loggedBugs": str(len(logged_bugs))})
                await _update_phase_step(db, gateway, analysis_id, project_id, phase, subprocesses, "fingerprint_errors", "completed", {"uniqueFingerprints": str(len({error.fingerprint for error in errors}))})
                await _update_phase_step(db, gateway, analysis_id, project_id, phase, subprocesses, "sync_bugs", "completed", {"totalEvidence": str(len(errors) + len(logged_bugs))})
                await add_log(db, gateway, analysis_id, project_id, "PASS", "Error & Evidence Collection",
                              f"Evidence set for this run: {len(errors)} static-analysis finding(s) "
                              f"+ {len(logged_bugs)} previously logged bug(s)", phase.id, phase.number)

            # Phase 5: AI Root Cause Analysis — REAL (Job 4). First of two
            # separate AI calls: diagnosis only, no patch (_diagnose_run_bugs
            # -> diagnose_root_cause). Moved from old #7 -> #5. Broken into
            # its 4 real sub-steps (understand the error, trace the relevant
            # code, determine root cause, determine impact) -- see
            # _diagnose_run_bugs for how each ticks live per bug.
            if definition["number"] == 5:
                subprocesses = _phase_steps([
                    ("understand_error", "Understand error", "ai"),
                    ("trace_relevant_code", "Trace relevant code", "ai"),
                    ("determine_root_cause", "Determine root cause", "ai"),
                    ("determine_impact", "Determine impact", "ai"),
                ])
                await set_subprocesses(db, gateway, analysis_id, project_id, phase, subprocesses)
                run_diagnoses = await _diagnose_run_bugs(db, gateway, project, analysis_id, phase, subprocesses)
                await add_log(db, gateway, analysis_id, project_id, "PASS", "AI Root Cause Analysis",
                              f"Generated {len(run_diagnoses)} AI root-cause diagnosis(es)", phase.id, phase.number)

            # Phase 6: AI Patch Generation — REAL (Job 4). Second separate AI
            # call, grounded in Phase 5's settled diagnosis
            # (_generate_run_patches -> generate_patch). Also creates each
            # bug's first FixAttempt row (attemptNumber=1) — the retry loop
            # that creates attempt 2+ is Job 6, not this phase.
            if definition["number"] == 6:
                subprocesses = _phase_steps([
                    ("synthesize_patches", "Synthesize patches from settled diagnoses", "ai"),
                    ("persist_proposals", "Persist fix proposals & attempt 1", "ai"),
                ])
                await set_subprocesses(db, gateway, analysis_id, project_id, phase, subprocesses)
                await _update_phase_step(db, gateway, analysis_id, project_id, phase, subprocesses, "synthesize_patches", "running")
                run_fixes = await _generate_run_patches(db, project, analysis_id, run_diagnoses)
                await _update_phase_step(db, gateway, analysis_id, project_id, phase, subprocesses, "synthesize_patches", "completed", {"patches": str(len(run_fixes))})
                await _update_phase_step(db, gateway, analysis_id, project_id, phase, subprocesses, "persist_proposals", "completed", {"proposals": str(len(run_fixes))})
                await add_log(db, gateway, analysis_id, project_id, "PASS", "AI Patch Generation",
                              f"Synthesized {len(run_fixes)} patch(es), attempt #1 recorded for each", phase.id, phase.number)

            # Phase 7: Isolated Environment — REUSED from old Phase 3
            # (_run_isolated_environment, unchanged body). Moved from #3 -> #7.
            if definition["number"] == 7:
                await _run_isolated_environment(
                    db, gateway, analysis_id, project_id, phase, work_root, project.language,
                )
                await add_log(db, gateway, analysis_id, project_id, "PASS", "Isolated Environment",
                              "Sandbox initialized and smoke-tested", phase.id, phase.number)

                # Database sidecar: only postgres/mysql have a provisioner
                # (db_sidecar.py). mongodb/sqlite/redis are detected but not
                # provisioned yet -- log that gap rather than silently
                # proceeding as if a database were reachable.
                if project.databaseType in ("postgres", "mysql"):
                    db_sidecar = await start_database_sidecar(project.databaseType, analysis_id)
                    if db_sidecar:
                        await add_log(db, gateway, analysis_id, project_id, "PASS", "Isolated Environment",
                                      f"{project.databaseType} sidecar ready for Phase 8", phase.id, phase.number)
                    else:
                        await add_log(db, gateway, analysis_id, project_id, "WARN", "Isolated Environment",
                                      f"Detected a {project.databaseType} dependency but the sidecar container "
                                      "failed to start or become ready — Phase 8 will run without a database, "
                                      "so a connection-refused failure there may be an environment gap, not a "
                                      "real bug.", phase.id, phase.number)
                elif project.databaseType:
                    await add_log(db, gateway, analysis_id, project_id, "WARN", "Isolated Environment",
                                  f"Detected a {project.databaseType} dependency, but there's no sidecar "
                                  "provisioner for it yet — Phase 8 will run without a database.", phase.id, phase.number)

            # Phase 8: Install -> Build -> Run & Test — REUSED from old
            # Phase 4 (build) + Phase 5 (test), merged into one phase.
            # Preview Checkpoint pause/resume NOT wired yet (Job 5) — runs
            # straight through to completion for now.
            if definition["number"] == 8:
                language = project.language or "Unknown"
                subprocesses = _phase_steps([
                    ("detect_build_command", "Detect build command", "build"),
                    ("execute_build", "Execute build in sandbox", "build"),
                    ("capture_build_output", "Capture build output and exit code", "build"),
                    ("start_application", "Start application & capture runtime errors", "runtime"),
                    ("detect_test_command", "Detect test command", "testing"),
                    ("execute_tests", "Execute tests in sandbox", "testing"),
                    ("parse_test_results", "Parse, categorize & persist test results", "testing"),
                ])
                await set_subprocesses(db, gateway, analysis_id, project_id, phase, subprocesses)

                # --- Install & Build ---
                await _update_phase_step(db, gateway, analysis_id, project_id, phase, subprocesses, "detect_build_command", "running")
                build_command = await detect_build_command(work_root, language)
                await _update_phase_step(db, gateway, analysis_id, project_id, phase, subprocesses, "detect_build_command", "completed", {"command": build_command})
                await _update_phase_step(db, gateway, analysis_id, project_id, phase, subprocesses, "execute_build", "running")
                build_result = await run_sandbox(
                    work_root, build_command, language,
                    network=db_sidecar["network"] if db_sidecar else None,
                    extra_env=db_sidecar["env"] if db_sidecar else None,
                )
                await _update_phase_step(db, gateway, analysis_id, project_id, phase, subprocesses, "execute_build", "completed" if build_result.code == 0 else "failed", {"durationMs": str(build_result.duration_ms)})
                await _update_phase_step(db, gateway, analysis_id, project_id, phase, subprocesses, "capture_build_output", "completed", {"exitCode": str(build_result.code), "stdoutBytes": str(len(build_result.stdout)), "stderrBytes": str(len(build_result.stderr))})

                if build_result.code != 0:
                    detail = _command_failure_detail(build_result)
                    error = await record_error(
                        db, project_id, f"Build command failed: {build_command}",
                        analysis_run_id=analysis_id, name="BuildError", stack_trace=detail,
                        source="build",
                    )
                    await create_bug_from_error(db, project, error)
                    await add_log(db, gateway, analysis_id, project_id, "ERROR", "Install & Build",
                                  f"Build failed: {detail[:4000]}", phase.id, phase.number)
                    await _report_phase8_errors_to_phase4(db, gateway, analysis_id, project_id, phases.get(4))
                    raise PipelineError(f"Build failed: {detail[:2000]}")
                await add_log(db, gateway, analysis_id, project_id, "PASS", "Install & Build",
                              f"Build succeeded with {build_command}", phase.id, phase.number)

                # --- Start Application (Job: 'Start application') ---
                await _check_application_starts(
                    db, gateway, analysis_id, project_id, project, phase, work_root, language, subprocesses,
                )

                # --- Run & Test ---
                await _update_phase_step(db, gateway, analysis_id, project_id, phase, subprocesses, "detect_test_command", "running")
                test_command = await detect_test_command(work_root, language)
                await _update_phase_step(db, gateway, analysis_id, project_id, phase, subprocesses, "detect_test_command", "completed", {"command": test_command})
                await _update_phase_step(db, gateway, analysis_id, project_id, phase, subprocesses, "execute_tests", "running")
                test_result = await run_sandbox(
                    work_root, test_command, language,
                    network=db_sidecar["network"] if db_sidecar else None,
                    extra_env=db_sidecar["env"] if db_sidecar else None,
                )
                summary = parse_generic_test_output(test_result.stdout, test_result.stderr, test_result.code)
                categories = categorize_test_output(test_result.stdout)
                await _update_phase_step(db, gateway, analysis_id, project_id, phase, subprocesses, "execute_tests", "completed" if test_result.code == 0 or summary.status == "NO_TESTS" else "failed", {"durationMs": str(test_result.duration_ms)})

                db.add(TestRun(
                    projectId=project_id, analysisRunId=analysis_id, command=test_command,
                    status=summary.status, total=summary.total, passed=summary.passed,
                    failed=summary.failed, skipped=summary.skipped, durationMs=test_result.duration_ms,
                    stdout=test_result.stdout[:100000], stderr=test_result.stderr[:100000],
                ))
                await db.commit()
                category_metrics = {
                    "status": summary.status, "total": str(summary.total),
                    "passed": str(summary.passed), "failed": str(summary.failed),
                }
                if categories:
                    # Only attached when categorize_test_output actually found
                    # pytest -v per-test lines to bucket -- absent for
                    # Go/Rust/JS or non-verbose output, matching the honest-gap
                    # pattern (no fabricated zeros for what we can't detect).
                    for name, counts in categories.items():
                        category_metrics[f"{name}Tests"] = f"{counts.passed}/{counts.total}"
                await _update_phase_step(db, gateway, analysis_id, project_id, phase, subprocesses, "parse_test_results", "completed", category_metrics)

                if categories:
                    breakdown = ", ".join(f"{n}: {c.passed}/{c.total}" for n, c in categories.items() if c.total)
                    await add_log(db, gateway, analysis_id, project_id, "INFO", "Testing",
                                  f"Test breakdown by type — {breakdown}", phase.id, phase.number)

                if summary.status == "NO_TESTS":
                    await add_log(db, gateway, analysis_id, project_id, "WARN", "Testing",
                                  "Test command ran, but the project contains no discovered tests.", phase.id, phase.number)
                elif test_result.code != 0:
                    detail = _command_failure_detail(test_result)
                    error = await record_error(
                        db, project_id, f"Test command failed: {test_command}",
                        analysis_run_id=analysis_id, name="TestFailure", stack_trace=detail,
                        source="test",
                    )
                    await create_bug_from_error(db, project, error)
                    await add_log(db, gateway, analysis_id, project_id, "ERROR", "Testing",
                                  f"Tests failed: {detail[:4000]}", phase.id, phase.number)
                    await _report_phase8_errors_to_phase4(db, gateway, analysis_id, project_id, phases.get(4))
                    raise PipelineError(f"Tests failed: {detail[:2000]}")

                # Error finder (Phase 8 -> Phase 4): clean-pass tail. Build
                # and tests both succeeded, but Phase 8's app-start check
                # (_check_application_starts, above) may still have recorded
                # an AppStartError/AppRuntimeError without raising -- so this
                # always re-syncs Phase 4, even on an otherwise-passing run.
                await _report_phase8_errors_to_phase4(db, gateway, analysis_id, project_id, phases.get(4))

                # Phase 8's TODO is resolved below, right after the shared
                # phase-completed tail block -- the checkpoint needs
                # phase.status == COMPLETED / durationMs set first, which
                # the shared tail computes, so the pause check runs after it.

            # Phase 9: Regression Check — REAL (Job 6). Full validation of
            # every Phase 6 patch, per bug, updating that bug's attempt #1
            # FixAttempt with the real pass/fail result and fingerprint.
            if definition["number"] == 9:
                fixes_stmt = select(FixProposal).where(FixProposal.analysisRunId == analysis_id)
                run_fixes = list((await db.execute(fixes_stmt)).scalars().all())
                subprocesses = _phase_steps([
                    ("load_proposals", "Load generated patch proposals", "validation"),
                    ("apply_disposable_patch", "Apply patches to disposable workspace", "validation"),
                    ("run_validation", "Run validation tests in sandbox", "validation"),
                ])
                await set_subprocesses(db, gateway, analysis_id, project_id, phase, subprocesses)
                await _update_phase_step(db, gateway, analysis_id, project_id, phase, subprocesses, "load_proposals", "completed", {"proposals": str(len(run_fixes))})
                await _update_phase_step(db, gateway, analysis_id, project_id, phase, subprocesses, "apply_disposable_patch", "running")
                run_regression_results = await _run_regression_validation(db, project, run_fixes)
                passed_count = sum(1 for r in run_regression_results.values() if r["passed"])
                await _update_phase_step(db, gateway, analysis_id, project_id, phase, subprocesses, "apply_disposable_patch", "completed", {"validated": str(len(run_regression_results))})
                await _update_phase_step(db, gateway, analysis_id, project_id, phase, subprocesses, "run_validation", "completed", {"passed": str(passed_count), "failed": str(len(run_regression_results) - passed_count)})

                for fix in run_fixes:
                    result = run_regression_results.get(fix.bugId)
                    if result is None:
                        continue
                    attempt_stmt = select(FixAttempt).where(FixAttempt.fixProposalId == fix.id)
                    attempt = (await db.execute(attempt_stmt)).scalar_one_or_none()
                    if attempt is None:
                        continue
                    attempt.resultStatus = FixAttemptResult.pass_ if result["passed"] else FixAttemptResult.fail
                    if not result["passed"]:
                        attempt.errorFingerprint = fingerprint(result["stderr"] or result["stdout"] or "validation failed")
                        attempt.rawErrorOutput = (result["stderr"] or result["stdout"])[:8000]
                await db.commit()

                await add_log(db, gateway, analysis_id, project_id, "PASS" if passed_count == len(run_regression_results) else "WARN",
                              "Regression Check", f"{passed_count}/{len(run_regression_results)} patch(es) passed validation", phase.id, phase.number)

            # Phase 10: Validation & Iteration — REAL (Job 6). The loop
            # controller: for every bug still failing after Phase 9, retries
            # via _retry_bug_until_pass_or_exhausted up to run.maxAttempts,
            # honoring the same-error fingerprint short-circuit. Bugs that
            # still fail after the loop (exhausted or short-circuited) push
            # the whole run to NEEDS_HUMAN_REVIEW instead of COMPLETED.
            if definition["number"] == 10:
                subprocesses = _phase_steps([
                    ("evaluate_results", "Evaluate pass/fail per bug", "validation"),
                    ("retry_loop", "Retry failing bugs (bounded)", "validation"),
                    ("finalize", "Finalize run outcome", "validation"),
                ])
                await set_subprocesses(db, gateway, analysis_id, project_id, phase, subprocesses)
                await _update_phase_step(db, gateway, analysis_id, project_id, phase, subprocesses, "evaluate_results", "running")

                failing_bug_ids = [bug_id for bug_id, r in run_regression_results.items() if not r["passed"]]
                await _update_phase_step(db, gateway, analysis_id, project_id, phase, subprocesses, "evaluate_results", "completed",
                                          {"failing": str(len(failing_bug_ids)), "passing": str(len(run_regression_results) - len(failing_bug_ids))})

                # GAP FIX: bugs that passed Phase 9's regression check on the
                # first try (never entered the retry loop below) previously
                # never had their status flipped to Fixed at all -- only the
                # retry-loop branch a few lines down did that. A clean
                # one-shot fix would validate successfully but Bug List
                # would still show it as unresolved. Mark those here,
                # before the retry loop handles the ones that DID fail.
                first_try_passed_ids = [bug_id for bug_id, r in run_regression_results.items() if r["passed"]]
                for bug_id in first_try_passed_ids:
                    bug = await db.get(Bug, bug_id)
                    if bug is not None:
                        bug.status = BugStatus.Fixed
                if first_try_passed_ids:
                    await db.commit()

                await _update_phase_step(db, gateway, analysis_id, project_id, phase, subprocesses, "retry_loop", "running")
                fixed_on_retry: list[str] = []
                same_error: list[str] = []
                exhausted: list[str] = []

                for bug_id in failing_bug_ids:
                    bug = await db.get(Bug, bug_id)
                    if bug is None:
                        continue
                    attempt_stmt = (
                        select(FixAttempt)
                        .where(FixAttempt.bugId == bug_id, FixAttempt.analysisRunId == analysis_id)
                        .order_by(FixAttempt.attemptNumber.desc())
                    )
                    latest_attempt = (await db.execute(attempt_stmt)).scalars().first()
                    if latest_attempt is None:
                        continue

                    outcome = await _retry_bug_until_pass_or_exhausted(
                        db, gateway, analysis_id, project_id, project, bug, latest_attempt, run.maxAttempts,
                    )
                    if outcome == "passed":
                        fixed_on_retry.append(bug_id)
                        bug.status = BugStatus.Fixed
                    elif outcome == "same_error":
                        same_error.append(bug_id)
                        bug.status = BugStatus.InReview
                    else:
                        exhausted.append(bug_id)
                        bug.status = BugStatus.InReview
                await db.commit()

                await _update_phase_step(db, gateway, analysis_id, project_id, phase, subprocesses, "retry_loop", "completed", {
                    "fixedOnRetry": str(len(fixed_on_retry)),
                    "sameErrorShortCircuit": str(len(same_error)),
                    "attemptsExhausted": str(len(exhausted)),
                })

                needs_human = bool(same_error or exhausted)
                await _update_phase_step(db, gateway, analysis_id, project_id, phase, subprocesses, "finalize", "completed", {"needsHumanReview": str(needs_human)})

                total_bugs = len(run_regression_results)
                final_passed = (total_bugs - len(failing_bug_ids)) + len(fixed_on_retry)
                final_failed = len(same_error) + len(exhausted)
                pass_rate_pct = round((final_passed / total_bugs) * 100) if total_bugs else 100
                if needs_human:
                    summary = (
                        f"{final_failed} of {total_bugs} bug(s) still failing after the retry loop "
                        f"({len(same_error)} hit the same error twice and were short-circuited, "
                        f"{len(exhausted)} exhausted all {run.maxAttempts} attempt(s))."
                    )
                    recommendation = "Needs human review before this run can be considered production-ready."
                else:
                    retry_note = f" ({len(fixed_on_retry)} of those fixed via the retry loop)" if fixed_on_retry else ""
                    summary = f"All {total_bugs} bug(s) validated for this run passed{retry_note}."
                    recommendation = "Patch set is production-ready — zero unresolved bugs after validation."
                await set_validation_report(db, gateway, analysis_id, project_id, phase, {
                    "totalTests": total_bugs,
                    "passedTests": final_passed,
                    "failedTests": final_failed,
                    "testPassRate": f"{final_passed}/{total_bugs} ({pass_rate_pct}%)",
                    "regressionFound": needs_human,
                    "summary": summary,
                    "recommendation": recommendation,
                    "cycleCount": 2 if (fixed_on_retry or same_error or exhausted) else 1,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })

                if needs_human:
                    run.status = AnalysisStatus.NEEDS_HUMAN_REVIEW
                    await add_log(db, gateway, analysis_id, project_id, "WARN", "Validation & Iteration",
                                  f"{len(same_error) + len(exhausted)} bug(s) still failing after the retry loop "
                                  f"({len(same_error)} same-error short-circuit, {len(exhausted)} attempts exhausted) — needs human review.", phase.id, phase.number)
                else:
                    extra = f" ({len(fixed_on_retry)} fixed via retry)" if fixed_on_retry else ""
                    await add_log(db, gateway, analysis_id, project_id, "PASS", "Validation & Iteration",
                                  f"All bugs passed validation{extra}.", phase.id, phase.number)

            await _set_phase_status(db, phase, PhaseStatus.COMPLETED)
            await gateway.publish(
                project_id,
                {"type": REALTIME_EVENTS["phase_progress"], "projectId": project_id, "analysisId": analysis_id,
                 "payload": {"id": phase.id, "number": phase.number, "name": phase.name, "status": phase.status,
                             "durationMs": phase.durationMs}},
            )
            await add_log(db, gateway, analysis_id, project_id, "PASS", definition["name"],
                          f"{definition['name']} completed", phase.id, phase.number)

            # Phase 8 real pause (Job 5): build/test just passed and the
            # phase is now marked COMPLETED by the shared tail above --
            # stop here instead of falling through to Phase 9. The task
            # ends successfully (not an error); resume_analysis_pipeline()
            # picks the run back up from Phase 9 once the user acts on the
            # checkpoint (or the resume endpoint is called directly).
            if definition["number"] == 8:
                checkpoint = PreviewCheckpoint(
                    analysisRunId=analysis_id,
                    status=CheckpointStatus.awaiting_decision,
                    promptMessages=[],
                    fileEditsDetected=[],
                )
                db.add(checkpoint)
                run.status = AnalysisStatus.AWAITING_REVIEW
                await db.commit()

                await gateway.publish(
                    project_id,
                    {"type": "analysis.awaiting_review", "projectId": project_id, "analysisId": analysis_id,
                     "payload": {"analysisId": analysis_id, "checkpointId": checkpoint.id}},
                )
                await add_log(db, gateway, analysis_id, project_id, "PASS", "Preview Checkpoint",
                              "Build and tests passed — paused for review. Waiting for you to continue, "
                              "before moving on to Regression Check.", phase.id, phase.number)
                return


        # Job 6: Phase 10 may already have set NEEDS_HUMAN_REVIEW when the
        # retry loop couldn't get every bug passing -- don't clobber that
        # back to COMPLETED.
        if run.status != AnalysisStatus.NEEDS_HUMAN_REVIEW:
            run.status = AnalysisStatus.COMPLETED
        run.completedAt = datetime.now(timezone.utc)
        project.status = ProjectStatus.READY
        await db.commit()

        # Run has truly finished (this point is only reached on a resumed
        # call -- Phase 8 always `return`s early above on a fresh run) --
        # tear down the database sidecar started back in Phase 7, if any.
        if project.databaseType in ("postgres", "mysql"):
            await stop_database_sidecar(analysis_id)

        await gateway.publish(
            project_id,
            {"type": "analysis.completed" if run.status == AnalysisStatus.COMPLETED else "analysis.needs_review",
             "projectId": project_id, "analysisId": analysis_id, "payload": {"analysisId": analysis_id}},
        )

    except Exception as exc:  # noqa: BLE001
        message = str(exc)
        if current_phase is not None and current_phase.status == PhaseStatus.RUNNING:
            await _set_phase_status(db, current_phase, PhaseStatus.FAILED)
        run.status = AnalysisStatus.FAILED
        run.completedAt = datetime.now(timezone.utc)
        run.errorMessage = message
        project.status = ProjectStatus.FAILED
        await db.commit()

        if project.databaseType in ("postgres", "mysql"):
            try:
                await stop_database_sidecar(analysis_id)
            except Exception:  # noqa: BLE001
                # Never let sidecar cleanup mask the real pipeline error.
                pass

        try:
            await add_log(db, gateway, analysis_id, project_id, "ERROR", "Pipeline",
                          f"Analysis failed: {message[:4000]}")
        except Exception:  # noqa: BLE001
            # Never let a logging failure mask the real pipeline error.
            pass

        await gateway.publish(
            project_id,
            {"type": "analysis.failed", "projectId": project_id, "analysisId": analysis_id, "payload": {"message": message}},
        )
        raise


async def resume_analysis_pipeline(
    db: AsyncSession,
    gateway: RealtimeGateway,
    analysis_id: str,
    project_id: str,
) -> None:
    """Job 5: resumes a run paused at the Phase 8 Preview Checkpoint.
    Called by the analysis.resume Celery task (see workers/celery_app.py),
    dispatched from POST /analysis/{id}/checkpoint/resume."""
    run = await db.get(AnalysisRun, analysis_id)
    if run is None:
        raise PipelineError("Analysis run not found")
    if run.status != AnalysisStatus.AWAITING_REVIEW:
        raise PipelineError(
            f"Analysis run is not awaiting review (current status: {run.status.value}) -- "
            "nothing to resume."
        )

    checkpoint_stmt = select(PreviewCheckpoint).where(PreviewCheckpoint.analysisRunId == analysis_id)
    checkpoint = (await db.execute(checkpoint_stmt)).scalar_one_or_none()
    if checkpoint is not None:
        checkpoint.status = CheckpointStatus.resumed
        checkpoint.resumedAt = datetime.now(timezone.utc)
        await db.commit()

    # run.status flips back to RUNNING inside run_analysis_pipeline itself
    # (same line that handles a fresh run) -- start_from_phase=9 skips the
    # already-COMPLETED phases 1-8 and picks up at Regression Check.
    await run_analysis_pipeline(db, gateway, analysis_id, project_id, start_from_phase=9)


async def reject_checkpoint(
    db: AsyncSession,
    gateway: RealtimeGateway,
    analysis_id: str,
    project_id: str,
) -> None:
    """Job 5: the other checkpoint decision -- the user reviewed the
    preview and doesn't want to continue. Ends the run as CANCELLED rather
    than resuming into Regression Check."""
    run = await db.get(AnalysisRun, analysis_id)
    if run is None:
        raise PipelineError("Analysis run not found")
    if run.status != AnalysisStatus.AWAITING_REVIEW:
        raise PipelineError(
            f"Analysis run is not awaiting review (current status: {run.status.value})."
        )

    checkpoint_stmt = select(PreviewCheckpoint).where(PreviewCheckpoint.analysisRunId == analysis_id)
    checkpoint = (await db.execute(checkpoint_stmt)).scalar_one_or_none()
    if checkpoint is not None:
        checkpoint.status = CheckpointStatus.rejected

    run.status = AnalysisStatus.CANCELLED
    run.completedAt = datetime.now(timezone.utc)
    run.errorMessage = "Cancelled at Preview Checkpoint"
    await db.commit()

    project = await db.get(Project, project_id)
    if project and project.databaseType in ("postgres", "mysql"):
        await stop_database_sidecar(analysis_id)

    await gateway.publish(
        project_id,
        {"type": "analysis.cancelled", "projectId": project_id, "analysisId": analysis_id, "payload": {"analysisId": analysis_id}},
    )