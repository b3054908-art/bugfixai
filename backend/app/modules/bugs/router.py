"""Mirrors: backend/src/modules/bugs/{bug.routes,bug.controller}.ts"""
from fastapi import APIRouter, Depends, Query

from app.common.middleware.auth import AuthUser, require_auth
from app.db.session import get_db
from app.modules.bugs.schemas import BugListResponse, BugOut, CreateBugRequest, UpdateBugRequest
from app.modules.bugs.service import clear_bugs, create_bug, get_bug, list_bugs, update_bug
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/bugs", tags=["bugs"])


@router.get("", response_model=BugListResponse)
async def list_(
    projectId: str,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=25, ge=1, le=100),
    severity: str | None = None,
    status: str | None = None,
    search: str | None = None,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    result = await list_bugs(db, current_user.id, projectId, page, limit, severity, status, search)
    return BugListResponse(
        items=[BugOut.model_validate(b) for b in result["items"]],
        page=result["page"],
        limit=result["limit"],
        total=result["total"],
    )


@router.post("", response_model=BugOut, status_code=201)
async def create(
    payload: CreateBugRequest,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    bug = await create_bug(db, current_user.id, payload)
    return BugOut.model_validate(bug)


@router.delete("")
async def clear(
    projectId: str,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Deletes every bug in a project. Also deletes that project's fix
    history, since every FixProposal belongs to exactly one Bug."""
    count = await clear_bugs(db, current_user.id, projectId)
    return {"deleted": count}


@router.get("/{bug_id}", response_model=BugOut)
async def get(
    bug_id: str,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    bug = await get_bug(db, current_user.id, bug_id)
    return BugOut.model_validate(bug)


@router.patch("/{bug_id}", response_model=BugOut)
async def update(
    bug_id: str,
    payload: UpdateBugRequest,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    bug = await update_bug(db, current_user.id, bug_id, payload)
    return BugOut.model_validate(bug)