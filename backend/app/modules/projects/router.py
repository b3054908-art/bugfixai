"""Mirrors: backend/src/modules/projects/project.routes.ts + project.controller.ts"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.middleware.auth import AuthUser, require_auth
from app.db.session import get_db
from app.modules.projects.schemas import (
    CreateProjectRequest,
    ProjectListResponse,
    ProjectOut,
)
from app.modules.projects.service import (
    create_project,
    delete_project,
    get_project,
    list_projects,
)

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=ProjectListResponse)
async def list_(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=25, ge=1, le=100),
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    result = await list_projects(db, current_user.id, page, limit)
    return ProjectListResponse(
        items=[ProjectOut.model_validate(p) for p in result["items"]],
        page=result["page"],
        limit=result["limit"],
        total=result["total"],
    )


@router.post("", response_model=ProjectOut, status_code=201)
async def create(
    payload: CreateProjectRequest,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    project = await create_project(db, current_user.id, payload)
    return ProjectOut.model_validate(project)


@router.get("/{project_id}", response_model=ProjectOut)
async def get(
    project_id: str,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    project = await get_project(db, current_user.id, project_id)
    return ProjectOut.model_validate(project)


@router.delete("/{project_id}", status_code=204)
async def remove(
    project_id: str,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    await delete_project(db, current_user.id, project_id)
