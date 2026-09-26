"""Preview: runs the uploaded project as a real, reachable web server so the
person can open it in a new browser tab — distinct from the analysis
pipeline's build/test sandbox, which never publishes a port.

Only ever started by an explicit user action (never automatically by the
pipeline), and only for languages/projects where detect_preview() found a
plausible web-server command in Phase 2 of the last analysis run.

Also drives the "Original (Buggy)" vs "AI Patched" build toggle: the two
builds are not separate containers or copies — there is exactly one
workspace on disk, and switching build re-applies or reverts the project's
AI fix proposals against it (reusing the same apply_fix/revert_fix logic the
Fixes tab already uses) before the preview container is (re)started to pick
up the change.
"""
import os

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.common.errors.app_error import AppError
from app.models.enums import FixStatus
from app.models.fix import FixProposal
from app.models.project import Project
from app.modules.fixes.service import apply_fix, revert_fix
from app.modules.sandbox.container_manager import start_preview_container, stop_preview_container


def _container_name(project_id: str) -> str:
    return f"bugfixer-preview-{project_id}"


def _public_url(host_port: int) -> str:
    codespace_name = os.environ.get("CODESPACE_NAME")
    forwarding_domain = os.environ.get("GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN")
    if codespace_name and forwarding_domain:
        return f"https://{codespace_name}-{host_port}.{forwarding_domain}"
    return f"http://localhost:{host_port}"


async def _assert_project_access(db: AsyncSession, owner_id: str, project_id: str) -> Project:
    stmt = (
        select(Project)
        .where(Project.id == project_id, Project.ownerId == owner_id)
        .options(selectinload(Project.workspace))
    )
    project = (await db.execute(stmt)).scalar_one_or_none()
    if project is None:
        raise AppError(404, "PROJECT_NOT_FOUND", "Project was not found")
    return project


async def _patchable_fixes(db: AsyncSession, project_id: str) -> list[FixProposal]:
    """Fixes with enough context to be toggled on/off the real workspace —
    same single-file-replacement constraint apply_fix/revert_fix require."""
    stmt = (
        select(FixProposal)
        .where(
            FixProposal.projectId == project_id,
            FixProposal.status.in_((FixStatus.Ready, FixStatus.Applied)),
        )
        .order_by(FixProposal.createdAt.asc())
    )
    fixes = (await db.execute(stmt)).scalars().all()
    return [f for f in fixes if f.originalCode and f.proposedCode and len(f.affectedFiles) == 1]


async def get_preview_state(db: AsyncSession, owner_id: str, project_id: str) -> dict:
    project = await _assert_project_access(db, owner_id, project_id)
    fixes = await _patchable_fixes(db, project_id)
    build = "patched" if any(f.status == FixStatus.Applied for f in fixes) else "original"
    return {
        "supported": bool(project.previewCommand and project.previewPort),
        "build": build,
        "fixes": [
            {"id": f.id, "file": f.affectedFiles[0], "summary": f.patchSummary, "status": f.status.value}
            for f in fixes
        ],
    }


async def _set_build(db: AsyncSession, owner_id: str, project_id: str, build: str) -> list[FixProposal]:
    fixes = await _patchable_fixes(db, project_id)
    if build == "patched":
        for fix in fixes:
            if fix.status == FixStatus.Ready:
                await apply_fix(db, owner_id, fix.id)
    else:
        for fix in fixes:
            if fix.status == FixStatus.Applied:
                await revert_fix(db, owner_id, fix.id)
    # Re-read so callers see post-toggle statuses.
    return await _patchable_fixes(db, project_id)


async def start_preview(db: AsyncSession, owner_id: str, project_id: str, build: str = "patched") -> dict:
    if build not in ("original", "patched"):
        raise AppError(400, "INVALID_BUILD", "build must be 'original' or 'patched'")

    project = await _assert_project_access(db, owner_id, project_id)

    if not project.previewCommand or not project.previewPort:
        raise AppError(
            422, "PREVIEW_NOT_SUPPORTED",
            "No runnable web-server command was detected for this project. "
            "Run analysis at least once first — Preview needs Phase 2 (Project Setup) to have run.",
        )
    if project.workspace is None or not project.workspace.rootPath:
        raise AppError(422, "WORKSPACE_MISSING", "This project has no extracted workspace to preview")

    fixes = await _set_build(db, owner_id, project_id, build)
    patched_count = sum(1 for f in fixes if f.status == FixStatus.Applied)

    result = await start_preview_container(
        workspace=project.workspace.rootPath,
        command=project.previewCommand,
        language="JavaScript" if "npm " in project.previewCommand else (project.language or "Unknown"),
        container_port=project.previewPort,
        name=_container_name(project_id),
    )
    if not result["ok"]:
        raise AppError(
            502, "PREVIEW_START_FAILED",
            f"Preview container failed to start or exited immediately: {result['error'][:500]}",
        )

    return {
        "url": _public_url(result["hostPort"]),
        "command": project.previewCommand,
        "port": project.previewPort,
        "build": build,
        "patchedFileCount": patched_count,
        "fixCount": len(fixes),
    }


async def stop_preview(db: AsyncSession, owner_id: str, project_id: str) -> None:
    await _assert_project_access(db, owner_id, project_id)  # ownership check even though nothing else is read
    await stop_preview_container(_container_name(project_id))
