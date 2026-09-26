"""Mirrors: backend/src/modules/analysis/pipeline/pipeline.service.ts"""
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.websocket.realtime_gateway import REALTIME_EVENTS, RealtimeGateway
from app.models.analysis import PipelineLog, PipelinePhase
from app.models.enums import PhaseStatus


async def set_phase(
    db: AsyncSession,
    gateway: RealtimeGateway,
    analysis_id: str,
    number: int,
    status: str,
    project_id: str,
) -> PipelinePhase:
    stmt = select(PipelinePhase).where(
        PipelinePhase.analysisRunId == analysis_id, PipelinePhase.number == number
    )
    phase = (await db.execute(stmt)).scalar_one_or_none()
    if phase is None:
        raise ValueError("Pipeline phase not found")

    now = datetime.now(timezone.utc)
    phase.status = PhaseStatus(status)
    if status == "RUNNING":
        phase.startedAt = phase.startedAt or now
    else:
        phase.completedAt = now
        if phase.startedAt:
            phase.durationMs = int((now - phase.startedAt).total_seconds() * 1000)

    await db.commit()
    await db.refresh(phase)

    event_type = REALTIME_EVENTS["phase_started"] if status == "RUNNING" else REALTIME_EVENTS["phase_progress"]
    await gateway.publish(
        project_id,
        {
            "type": event_type,
            "projectId": project_id,
            "analysisId": analysis_id,
            "payload": {
                "id": phase.id,
                "number": phase.number,
                "name": phase.name,
                "status": phase.status,
                "durationMs": phase.durationMs,
            },
        },
    )
    return phase


async def set_subprocesses(
    db: AsyncSession,
    gateway: RealtimeGateway,
    analysis_id: str,
    project_id: str,
    phase: PipelinePhase,
    subprocesses: list[dict],
) -> PipelinePhase:
    """Persist the real sub-process checklist for a phase and broadcast the tick
    update live, so the modal's Sub-Processes tab reflects actual progress
    instead of a hardcoded fallback list.

    `subprocesses` is a list of dicts shaped like the frontend's
    PhaseSubprocess type: {id, name, completed, status, category?, metrics?}
    """
    phase.subprocesses = subprocesses
    await db.commit()
    await db.refresh(phase)

    await gateway.publish(
        project_id,
        {
            "type": REALTIME_EVENTS["subprocess_updated"],
            "projectId": project_id,
            "analysisId": analysis_id,
            "payload": {"number": phase.number, "subprocesses": subprocesses},
        },
    )
    return phase


async def set_security_report(
    db: AsyncSession,
    gateway: RealtimeGateway,
    analysis_id: str,
    project_id: str,
    phase: PipelinePhase,
    security_checks: list[dict],
) -> PipelinePhase:
    """Persist the real Phase 1 security-check results (validationReport is a
    generic JSON column also used for the Phase 8 audit report — this reuses
    it under a 'securityChecks' key rather than requiring a migration)."""
    phase.validationReport = {**(phase.validationReport or {}), "securityChecks": security_checks}
    await db.commit()
    await db.refresh(phase)

    await gateway.publish(
        project_id,
        {
            "type": REALTIME_EVENTS["security_updated"],
            "projectId": project_id,
            "analysisId": analysis_id,
            "payload": {"number": phase.number, "securityChecks": security_checks},
        },
    )
    return phase


async def set_validation_report(
    db: AsyncSession,
    gateway: RealtimeGateway,
    analysis_id: str,
    project_id: str,
    phase: PipelinePhase,
    report: dict,
) -> PipelinePhase:
    """Persist Phase 10's real Final Audit Report (pass rate, regressions,
    retry outcome, recommendation) — reuses the validationReport JSON column
    (already used by Phase 1's securityChecks) under phase-10-specific keys."""
    phase.validationReport = {**(phase.validationReport or {}), **report}
    await db.commit()
    await db.refresh(phase)

    await gateway.publish(
        project_id,
        {
            "type": REALTIME_EVENTS["validation_updated"],
            "projectId": project_id,
            "analysisId": analysis_id,
            "payload": {"number": phase.number, "validationReport": phase.validationReport},
        },
    )
    return phase


async def add_log(
    db: AsyncSession,
    gateway: RealtimeGateway,
    analysis_id: str,
    project_id: str,
    level: str,
    category: str,
    message: str,
    phase_id: str | None = None,
    phase_number: int | None = None,
) -> PipelineLog:
    log = PipelineLog(
        analysisRunId=analysis_id,
        phaseId=phase_id,
        level=level,
        category=category,
        message=message,
    )
    db.add(log)
    await db.commit()
    await db.refresh(log)

    await gateway.publish(
        project_id,
        {
            "type": REALTIME_EVENTS["log_created"],
            "projectId": project_id,
            "analysisId": analysis_id,
            "payload": {
                "id": log.id,
                "timestamp": log.timestamp.isoformat(),
                "level": log.level,
                "category": log.category,
                "message": log.message,
                "phaseId": log.phaseId,
                "phaseNumber": phase_number,
            },
        },
    )
    return log