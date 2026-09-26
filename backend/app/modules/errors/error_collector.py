"""Mirrors: backend/src/modules/errors/error-collector.service.ts"""
import hashlib

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bug import ErrorRecord


def fingerprint(message: str, stack_trace: str | None = None) -> str:
    payload = f"{message}\n{stack_trace or ''}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:32]


async def record_error(
    db: AsyncSession,
    project_id: str,
    message: str,
    analysis_run_id: str | None = None,
    name: str | None = None,
    stack_trace: str | None = None,
    file_path: str | None = None,
    line_number: int | None = None,
    source: str | None = None,
) -> ErrorRecord:
    record = ErrorRecord(
        projectId=project_id,
        analysisRunId=analysis_run_id,
        name=name,
        message=message,
        stackTrace=stack_trace,
        filePath=file_path,
        lineNumber=line_number,
        source=source,
        fingerprint=fingerprint(message, stack_trace),
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record
