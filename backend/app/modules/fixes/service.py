"""Mirrors: backend/src/modules/fixes/fix.service.ts"""
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.common.errors.app_error import AppError
from app.models.bug import Bug
from app.models.enums import AIStatus, BugStatus, FixStatus, Provider
from app.models.fix import FixProposal
from app.models.project import Project
from app.modules.ai.service import diagnose_root_cause, generate_patch
from app.modules.fixes.patch_service import (
    apply_simple_replacement,
    count_changed_lines,
    read_workspace_file,
    write_workspace_file,
)
from app.modules.fixes.validation_service import validate_workspace


async def _assert_fix_access(db: AsyncSession, user_id: str, fix_id: str) -> FixProposal:
    stmt = (
        select(FixProposal)
        .join(Project, FixProposal.projectId == Project.id)
        .where(FixProposal.id == fix_id, Project.ownerId == user_id)
        .options(selectinload(FixProposal.project).selectinload(Project.workspace))
    )
    fix = (await db.execute(stmt)).scalar_one_or_none()
    if fix is None:
        raise AppError(404, "FIX_NOT_FOUND", "Fix proposal was not found")
    return fix


async def generate_fix(db: AsyncSession, user_id: str, bug_id: str, provider: str | None, model: str | None) -> FixProposal:
    """On-demand entry point (POST /fixes/generate). Job 4: now genuinely
    two separate AI calls -- diagnose_root_cause then generate_patch --
    instead of one merged prompt, matching what Phase 5/6 do in the
    pipeline. Root cause is folded into the stored explanation so nothing
    the model diagnosed gets silently dropped."""
    stmt = select(Bug).join(Project, Bug.projectId == Project.id).where(
        Bug.id == bug_id, Project.ownerId == user_id
    )
    bug = (await db.execute(stmt)).scalar_one_or_none()
    if bug is None:
        raise AppError(404, "BUG_NOT_FOUND", "Bug was not found")

    diagnosis = await diagnose_root_cause(db, user_id, bug.projectId, bug.id, provider, model)
    patch = await generate_patch(db, user_id, bug.projectId, bug.id, diagnosis, diagnosis["provider"], diagnosis["model"])

    root_cause = diagnosis.get("rootCause", "")
    explanation = f"Root cause: {root_cause}\n\n{diagnosis['explanation']}" if root_cause else diagnosis["explanation"]

    fix = FixProposal(
        bugId=bug.id,
        projectId=bug.projectId,
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
    await db.commit()
    await db.refresh(fix)
    return fix


async def list_fixes(db: AsyncSession, user_id: str, analysis_run_id: str | None = None) -> list[FixProposal]:
    stmt = (
        select(FixProposal)
        .join(Project, FixProposal.projectId == Project.id)
        .where(Project.ownerId == user_id)
        .order_by(FixProposal.createdAt.desc())
        .options(selectinload(FixProposal.bug), selectinload(FixProposal.validations))
    )
    if analysis_run_id is not None:
        stmt = stmt.where(FixProposal.analysisRunId == analysis_run_id)
    return (await db.execute(stmt)).scalars().all()


async def get_fix(db: AsyncSession, user_id: str, fix_id: str) -> FixProposal:
    return await _assert_fix_access(db, user_id, fix_id)

async def get_fix_summary(db: AsyncSession, user_id: str) -> dict:
    fixes = await list_fixes(db, user_id)

    if not fixes:
        return {
            "projectCount": 0,
            "dateSpanDays": 0,
            "regressionsFound": 0,
            "acceptanceRate": 0,
            "estimatedDollarsSaved": 0,
        }

    project_count = len({f.projectId for f in fixes})

    created_dates = [f.createdAt for f in fixes]
    date_span_days = (max(created_dates) - min(created_dates)).days

    regressions_found = sum(
        1 for f in fixes for v in f.validations if v.regressionFound
    )

    applied_count = sum(1 for f in fixes if f.status == FixStatus.Applied)
    acceptance_rate = round((applied_count / len(fixes)) * 100) if fixes else 0

    total_minutes_saved = sum(f.estimatedMinutes for f in fixes)
    estimated_dollars_saved = round((total_minutes_saved / 60) * 75)

    return {
        "projectCount": project_count,
        "dateSpanDays": date_span_days,
        "regressionsFound": regressions_found,
        "acceptanceRate": acceptance_rate,
        "estimatedDollarsSaved": estimated_dollars_saved,
    }

async def clear_fix_history(db: AsyncSession, user_id: str, project_id: str) -> int:
    """Deletes every FixProposal for a project, leaving its bugs in place.
    FixValidation rows cascade automatically (ondelete=CASCADE)."""
    project = (
        await db.execute(select(Project).where(Project.id == project_id, Project.ownerId == user_id))
    ).scalar_one_or_none()
    if project is None:
        raise AppError(404, "PROJECT_NOT_FOUND", "Project was not found")

    count = (
        await db.execute(
            select(func.count()).select_from(FixProposal).where(FixProposal.projectId == project_id)
        )
    ).scalar_one()
    await db.execute(delete(FixProposal).where(FixProposal.projectId == project_id))
    await db.commit()
    return count


async def validate_fix(db: AsyncSession, user_id: str, fix_id: str, command: str) -> dict:
    fix = await _assert_fix_access(db, user_id, fix_id)
    if not fix.project.workspace or not fix.project.workspace.rootPath:
        raise AppError(409, "WORKSPACE_NOT_READY", "Workspace is not initialized")
    return await validate_workspace(db, fix.projectId, fix.id, fix.project.workspace.rootPath, command)


async def apply_fix(db: AsyncSession, user_id: str, fix_id: str) -> dict:
    fix = await _assert_fix_access(db, user_id, fix_id)
    if not fix.project.workspace or not fix.project.workspace.rootPath:
        raise AppError(409, "WORKSPACE_NOT_READY", "Workspace is not initialized")
    if not fix.originalCode or not fix.proposedCode or len(fix.affectedFiles) != 1:
        raise AppError(400, "PATCH_CONTEXT_REQUIRED", "This fix does not contain a single-file safe replacement context")

    file = fix.affectedFiles[0]
    current = await read_workspace_file(fix.project.workspace.rootPath, file)
    updated = apply_simple_replacement(current, fix.originalCode, fix.proposedCode)
    await write_workspace_file(fix.project.workspace.rootPath, file, updated)

    from datetime import datetime, timezone

    fix.status = FixStatus.Applied
    fix.appliedAt = datetime.now(timezone.utc)

    bug = (await db.execute(select(Bug).where(Bug.id == fix.bugId))).scalar_one()
    bug.status = BugStatus.Fixed
    bug.aiStatus = AIStatus.Applied

    await db.commit()
    return {"status": "Applied", "file": file}


async def revert_fix(db: AsyncSession, user_id: str, fix_id: str) -> dict:
    fix = await _assert_fix_access(db, user_id, fix_id)
    if not fix.originalCode or not fix.proposedCode or len(fix.affectedFiles) != 1:
        raise AppError(400, "REVERT_CONTEXT_REQUIRED", "This fix cannot be safely reverted from the stored context")
    if not fix.project.workspace or not fix.project.workspace.rootPath:
        raise AppError(409, "WORKSPACE_NOT_READY", "Workspace is not initialized")

    file = fix.affectedFiles[0]
    current = await read_workspace_file(fix.project.workspace.rootPath, file)
    reverted = apply_simple_replacement(current, fix.proposedCode, fix.originalCode)
    await write_workspace_file(fix.project.workspace.rootPath, file, reverted)

    fix.status = FixStatus.Superseded

    bug = (await db.execute(select(Bug).where(Bug.id == fix.bugId))).scalar_one()
    bug.status = BugStatus.Open
    bug.aiStatus = AIStatus.Pending

    await db.commit()
    return {"status": "Reverted", "file": file}