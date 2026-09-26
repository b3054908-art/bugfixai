"""Mirrors: backend/src/modules/bugs/{bug.service,bug.repository}.ts"""
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.common.errors.app_error import AppError
from app.common.utils.ids import ensure_valid_id
from app.models.bug import Bug, BugOccurrence, ErrorRecord
from app.models.enums import BugStatus, Severity
from app.models.fix import FixProposal
from app.models.project import Project
from app.modules.bugs.schemas import CreateBugRequest, UpdateBugRequest


async def _assert_project_access(db: AsyncSession, owner_id: str, project_id: str) -> Project:
    ensure_valid_id(project_id, field="projectId")
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.ownerId == owner_id)
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise AppError(404, "PROJECT_NOT_FOUND", "Project was not found")
    return project


async def list_bugs(
    db: AsyncSession,
    owner_id: str,
    project_id: str,
    page: int,
    limit: int,
    severity: str | None = None,
    status: str | None = None,
    search: str | None = None,
) -> dict:
    await _assert_project_access(db, owner_id, project_id)

    stmt = select(Bug).where(Bug.projectId == project_id)
    count_stmt = select(func.count()).select_from(Bug).where(Bug.projectId == project_id)

    if severity:
        try:
            sev = Severity(severity)
        except ValueError:
            raise AppError(400, "VALIDATION_ERROR", "Invalid severity value")
        stmt = stmt.where(Bug.severity == sev)
        count_stmt = count_stmt.where(Bug.severity == sev)

    if status:
        try:
            st = BugStatus(status)
        except ValueError:
            raise AppError(400, "VALIDATION_ERROR", "Invalid status value")
        stmt = stmt.where(Bug.status == st)
        count_stmt = count_stmt.where(Bug.status == st)

    if search:
        like = f"%{search}%"
        clause = or_(
            Bug.title.ilike(like),
            Bug.code.ilike(like),
            Bug.component.ilike(like),
            Bug.filePath.ilike(like),
        )
        stmt = stmt.where(clause)
        count_stmt = count_stmt.where(clause)

    stmt = stmt.order_by(Bug.updatedAt.desc()).offset((page - 1) * limit).limit(limit)

    items = (await db.execute(stmt)).scalars().all()
    total = (await db.execute(count_stmt)).scalar_one()

    return {"items": items, "page": page, "limit": limit, "total": total}


async def get_bug(db: AsyncSession, owner_id: str, bug_id: str) -> Bug:
    ensure_valid_id(bug_id, field="bugId")
    stmt = (
        select(Bug)
        .join(Project, Bug.projectId == Project.id)
        .where(Bug.id == bug_id, Project.ownerId == owner_id)
        .options(selectinload(Bug.fixes), selectinload(Bug.occurrences))
    )
    bug = (await db.execute(stmt)).scalar_one_or_none()
    if bug is None:
        raise AppError(404, "BUG_NOT_FOUND", "Bug was not found")
    return bug


async def create_bug(db: AsyncSession, owner_id: str, payload: CreateBugRequest) -> Bug:
    await _assert_project_access(db, owner_id, payload.projectId)

    count = (
        await db.execute(
            select(func.count()).select_from(Bug).where(Bug.projectId == payload.projectId)
        )
    ).scalar_one()
    code = f"BUG-{count + 1:03d}"

    bug = Bug(
        projectId=payload.projectId,
        code=code,
        title=payload.title,
        description=payload.description,
        tags=payload.tags,
        severity=Severity(payload.severity),
        language=payload.language,
        component=payload.component,
        filePath=payload.filePath,
        lineNumber=payload.lineNumber,
        stackTrace=payload.stackTrace,
    )
    db.add(bug)
    await db.commit()
    await db.refresh(bug)
    return bug


async def create_bug_from_error(db: AsyncSession, project: Project, error: ErrorRecord) -> Bug:
    """Bridges Phase 6 (Error Collection) to the Bug List / AI diagnosis flow.

    Previously the pipeline only ever wrote to ErrorRecord, and Bug rows
    could only be created by hand through the "Log Bug" modal in the
    frontend — so a real build/test failure the pipeline found was never
    visible in Bug List and could never reach POST /fixes/generate. This
    dedupes on ErrorRecord.fingerprint: a failure seen again on a later run
    adds a BugOccurrence to the existing open Bug instead of creating a
    duplicate one.
    """
    existing_stmt = select(Bug).where(
        Bug.projectId == project.id,
        Bug.fingerprint == error.fingerprint,
        Bug.status.in_((BugStatus.Open, BugStatus.InReview, BugStatus.AISuggested)),
    )
    bug = (await db.execute(existing_stmt)).scalar_one_or_none()

    if bug is not None:
        db.add(BugOccurrence(
            bugId=bug.id,
            errorId=error.id,
            lineNumber=error.lineNumber,
            filePath=error.filePath,
        ))
        await db.commit()
        await db.refresh(bug)
        return bug

    count = (
        await db.execute(
            select(func.count()).select_from(Bug).where(Bug.projectId == project.id)
        )
    ).scalar_one()
    code = f"BUG-{count + 1:03d}"

    # BuildError blocks the whole pipeline so it's Critical; a failing test
    # (TestFailure) is High but not necessarily blocking. Anything else
    # (future error sources) defaults to Medium rather than guessing high.
    severity = {
        "BuildError": Severity.Critical,
        "TestFailure": Severity.High,
    }.get(error.name or "", Severity.Medium)

    title = error.message[:200] if error.message else (error.name or "Unnamed error")

    bug = Bug(
        projectId=project.id,
        analysisRunId=error.analysisRunId,
        code=code,
        title=title,
        description=error.stackTrace[:2000] if error.stackTrace else None,
        tags=[f"#{(error.name or 'error').lower()}", "#auto-detected"],
        severity=severity,
        status=BugStatus.Open,
        language=project.language or "Unknown",
        component=error.filePath or error.source or "Unknown",
        filePath=error.filePath,
        lineNumber=error.lineNumber,
        stackTrace=error.stackTrace,
        fingerprint=error.fingerprint,
    )
    db.add(bug)
    await db.commit()
    await db.refresh(bug)

    db.add(BugOccurrence(
        bugId=bug.id,
        errorId=error.id,
        lineNumber=error.lineNumber,
        filePath=error.filePath,
    ))
    await db.commit()
    return bug


async def clear_bugs(db: AsyncSession, owner_id: str, project_id: str) -> int:
    """Deletes every Bug in a project. FK cascades (ondelete=CASCADE) take care
    of BugOccurrence and FixProposal rows automatically, so a project's fix
    history disappears along with its bugs by design.
    """
    await _assert_project_access(db, owner_id, project_id)
    count = (
        await db.execute(select(func.count()).select_from(Bug).where(Bug.projectId == project_id))
    ).scalar_one()
    await db.execute(delete(Bug).where(Bug.projectId == project_id))
    await db.commit()
    return count


async def update_bug(db: AsyncSession, owner_id: str, bug_id: str, payload: UpdateBugRequest) -> Bug:
    bug = await get_bug(db, owner_id, bug_id)
    if payload.status is not None:
        try:
            bug.status = BugStatus(payload.status)
        except ValueError:
            raise AppError(400, "VALIDATION_ERROR", "Invalid status value")
    if payload.severity is not None:
        try:
            bug.severity = Severity(payload.severity)
        except ValueError:
            raise AppError(400, "VALIDATION_ERROR", "Invalid severity value")
    if payload.tags is not None:
        bug.tags = payload.tags
    await db.commit()
    await db.refresh(bug)
    return bug