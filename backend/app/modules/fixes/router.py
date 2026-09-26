"""Mirrors: backend/src/modules/fixes/{fix.routes,fix.controller}.ts"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.middleware.auth import AuthUser, require_auth
from app.db.session import get_db
from app.modules.fixes.schemas import FixOut, GenerateFixRequest, ValidateFixRequest
from app.modules.fixes.service import (
    apply_fix,
    clear_fix_history,
    generate_fix,
    get_fix,
    get_fix_summary,
    list_fixes,
    revert_fix,
    validate_fix,
)

router = APIRouter(prefix="/fixes", tags=["fixes"])


@router.get("/summary")
async def summary(
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    return await get_fix_summary(db, current_user.id)


@router.get("/history", response_model=list[FixOut])
async def history(
    analysis_run_id: str | None = Query(default=None, alias="analysisRunId"),
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    fixes = await list_fixes(db, current_user.id, analysis_run_id)
    return [FixOut.model_validate(f) for f in fixes]


@router.delete("/history")
async def clear_history(
    projectId: str,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    count = await clear_fix_history(db, current_user.id, projectId)
    return {"deleted": count}


@router.get("/{fix_id}", response_model=FixOut)
async def get(
    fix_id: str,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    fix = await get_fix(db, current_user.id, fix_id)
    return FixOut.model_validate(fix)


@router.post("/generate", response_model=FixOut, status_code=202)
async def generate(
    payload: GenerateFixRequest,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    fix = await generate_fix(db, current_user.id, payload.bugId, payload.provider, payload.model)
    return FixOut.model_validate(fix)


@router.post("/{fix_id}/validate")
async def validate(
    fix_id: str,
    payload: ValidateFixRequest,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    result = await validate_fix(db, current_user.id, fix_id, payload.command)
    return {
        "validation": {
            "id": result["validation"].id,
            "status": result["validation"].status,
            "testPassRate": result["validation"].testPassRate,
            "summary": result["validation"].summary,
        },
        "stdout": result["stdout"],
        "stderr": result["stderr"],
    }


@router.post("/{fix_id}/apply")
async def apply(
    fix_id: str,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    return await apply_fix(db, current_user.id, fix_id)


@router.post("/{fix_id}/revert")
async def revert(
    fix_id: str,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    return await revert_fix(db, current_user.id, fix_id)