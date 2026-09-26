"""Mirrors: backend/src/modules/analysis/{analysis.routes,analysis.controller}.ts"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.middleware.auth import AuthUser, require_auth
from app.db.session import get_db
from app.modules.analysis.schemas import (
    AnalysisRunDetailOut,
    AnalysisRunOut,
    CheckpointFileEditIn,
    CheckpointPromptIn,
    PipelineLogOut,
    PreviewCheckpointOut,
    RecentAnalysisResponse,
)
from app.modules.analysis.service import (
    append_checkpoint_file_edit,
    append_checkpoint_prompt,
    cancel_analysis,
    clear_all_analysis_runs,
    clear_analysis_runs,
    count_analysis_runs,
    create_analysis,
    get_analysis,
    get_checkpoint,
    list_analyses,
    list_logs,
    list_recent_analyses,
    reject_checkpoint,
    resume_checkpoint,
)

router = APIRouter(prefix="/analysis", tags=["analysis"])


@router.get("/recent", response_model=RecentAnalysisResponse)
async def recent(
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    result = await list_recent_analyses(db, current_user.id)
    return result


@router.delete("/recent")
async def clear_recent(
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Deletes all analysis history shown by the Dashboard's Recent Runs panel."""
    count = await clear_all_analysis_runs(db, current_user.id)
    return {"deleted": count}


@router.post("/projects/{project_id}/run", response_model=AnalysisRunOut, status_code=202)
async def create(
    project_id: str,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    run = await create_analysis(db, current_user.id, project_id)
    return AnalysisRunOut.model_validate(run)


@router.get("/projects/{project_id}", response_model=list[AnalysisRunOut])
async def list_(
    project_id: str,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    runs = await list_analyses(db, current_user.id, project_id)
    return [AnalysisRunOut.model_validate(r) for r in runs]


@router.get("/projects/{project_id}/count")
async def count(
    project_id: str,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    count = await count_analysis_runs(db, current_user.id, project_id)
    return {"count": count}


@router.delete("/projects/{project_id}")
async def clear(
    project_id: str,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Deletes a project's analysis run history — what the Dashboard's
    "Recent Runs" panel reads from. Bugs/fixes are kept (see
    clear_analysis_runs docstring); their recorded test results go with
    the run since TestRun.analysisRunId cascades."""
    count = await clear_analysis_runs(db, current_user.id, project_id)
    return {"deleted": count}


@router.get("/{analysis_id}", response_model=AnalysisRunDetailOut)
async def get(
    analysis_id: str,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    run = await get_analysis(db, current_user.id, analysis_id)
    return AnalysisRunDetailOut.model_validate(run)


@router.get("/{analysis_id}/logs", response_model=list[PipelineLogOut])
async def logs(
    analysis_id: str,
    phase: int | None = Query(default=None, description="Filter to one phase by its number (1-10)"),
    limit: int = Query(default=1000, le=5000),
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    rows = await list_logs(db, current_user.id, analysis_id, phase_number=phase, limit=limit)
    return [
        PipelineLogOut(
            id=r.id,
            phaseId=r.phaseId,
            phaseNumber=r.phase.number if r.phase else None,
            timestamp=r.timestamp,
            level=r.level,
            category=r.category,
            message=r.message,
        )
        for r in rows
    ]


@router.post("/{analysis_id}/cancel", response_model=AnalysisRunOut)
async def cancel(
    analysis_id: str,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    run = await cancel_analysis(db, current_user.id, analysis_id)
    return AnalysisRunOut.model_validate(run)


@router.get("/{analysis_id}/checkpoint", response_model=PreviewCheckpointOut)
async def checkpoint(
    analysis_id: str,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Job 5: the dashboard polls this (or listens for analysis.awaiting_review
    on the websocket) once a run reaches Phase 8 to know it's paused."""
    cp = await get_checkpoint(db, current_user.id, analysis_id)
    return PreviewCheckpointOut.model_validate(cp)


@router.post("/{analysis_id}/checkpoint/resume", response_model=AnalysisRunOut)
async def checkpoint_resume(
    analysis_id: str,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Job 5: the "Continue" action on the Preview Checkpoint card --
    dispatches analysis.resume, which continues at Phase 9 (Regression Check)."""
    run = await resume_checkpoint(db, current_user.id, analysis_id)
    return AnalysisRunOut.model_validate(run)


@router.post("/{analysis_id}/checkpoint/reject", response_model=AnalysisRunOut)
async def checkpoint_reject(
    analysis_id: str,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Job 5: the other checkpoint action -- ends the run as CANCELLED
    instead of continuing into Regression Check."""
    run = await reject_checkpoint(db, current_user.id, analysis_id)
    return AnalysisRunOut.model_validate(run)


@router.post("/{analysis_id}/checkpoint/prompt", response_model=PreviewCheckpointOut)
async def checkpoint_prompt(
    analysis_id: str,
    payload: CheckpointPromptIn,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Job 7: the Preview Checkpoint's prompt pad -- appends the user's
    message and a real AI reply, both in one call."""
    cp = await append_checkpoint_prompt(db, current_user.id, analysis_id, payload.text)
    return PreviewCheckpointOut.model_validate(cp)


@router.post("/{analysis_id}/checkpoint/file-edit", response_model=PreviewCheckpointOut)
async def checkpoint_file_edit(
    analysis_id: str,
    payload: CheckpointFileEditIn,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Job 7: records a file edit detected on the live preview container."""
    cp = await append_checkpoint_file_edit(db, current_user.id, analysis_id, payload.filePath, payload.diffSnippet, payload.newContent)
    return PreviewCheckpointOut.model_validate(cp)