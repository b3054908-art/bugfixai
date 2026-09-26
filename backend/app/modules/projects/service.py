"""Mirrors: backend/src/modules/projects/project.service.ts + project.repository.ts"""
import os
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.common.errors.app_error import AppError
from app.core.config import settings
from app.models.project import Project
from app.models.settings import ProjectSetting
from app.models.context import Workspace
from app.modules.projects.schemas import CreateProjectRequest
from app.models.enums import SourceType

async def list_projects(db: AsyncSession, owner_id: str, page: int, limit: int):
    skip = (page - 1) * limit

    items_stmt = (
        select(Project)
        .where(Project.ownerId == owner_id)
        .options(selectinload(Project.workspace), selectinload(Project.setting))
        .order_by(Project.updatedAt.desc())
        .offset(skip)
        .limit(limit)
    )
    count_stmt = select(func.count()).select_from(Project).where(Project.ownerId == owner_id)

    items = (await db.execute(items_stmt)).scalars().all()
    total = (await db.execute(count_stmt)).scalar_one()

    return {"items": items, "page": page, "limit": limit, "total": total}

async def get_project(db: AsyncSession, owner_id: str, project_id: str) -> Project:
    try:
        uuid.UUID(project_id)
    except ValueError:
        # A malformed ID (not a UUID at all) is treated the same as "not
        # found" rather than letting the DB reject it with a raw 500 —
        # same outcome either way from the client's point of view.
        raise AppError(404, "PROJECT_NOT_FOUND", "Project was not found")

    stmt = (
        select(Project)
        .where(Project.id == project_id, Project.ownerId == owner_id)
        .options(selectinload(Project.workspace), selectinload(Project.setting))
    )
    project = (await db.execute(stmt)).scalar_one_or_none()
    if project is None:
        raise AppError(404, "PROJECT_NOT_FOUND", "Project was not found")
    return project


async def create_project(db: AsyncSession, owner_id: str, payload: CreateProjectRequest) -> Project:
    project = Project(
        ownerId=owner_id,
        name=payload.name,
       sourceType=SourceType(payload.sourceType),
        repositoryUrl=str(payload.repositoryUrl) if payload.repositoryUrl else None,
        defaultBranch=payload.defaultBranch,
    )
    db.add(project)
    await db.flush()  # assigns project.id

    # Each project gets its own real, isolated directory on disk to read/write
    # files from. Previously this was left as "" (a placeholder), which made
    # `os.scandir("")` fail inside workspace.tree() (silently returning an
    # empty list) and made workspace.write_file() write relative to the
    # server's current working directory instead of the project's sandbox.
    root_path = os.path.abspath(os.path.join(settings.SANDBOX_WORK_ROOT, project.id))
    os.makedirs(root_path, exist_ok=True)

    db.add(ProjectSetting(projectId=project.id))
    db.add(Workspace(projectId=project.id, rootPath=root_path))

    await db.commit()

    return await get_project(db, owner_id, project.id)


async def delete_project(db: AsyncSession, owner_id: str, project_id: str) -> None:
    project = await get_project(db, owner_id, project_id)
    await db.delete(project)
    await db.commit()