"""Pipeline v2 loop/checkpoint tables.

Backs the frontend's FixAttempt / PreviewCheckpoint TypeScript interfaces
(frontend/src/types.ts, "Pipeline v2 (10-phase architecture)" section),
which until now only existed as UI-scaffold types with no backend behind
them (see mockData.ts initialFixAttempts / initialPreviewCheckpoint).

FixAttempt: one row per patch-generate-and-validate cycle within an
AnalysisRun. Phase 6 (AI Patch Generation) creates one on every pass
through the loop; Phase 10 (Validation & Iteration) sets resultStatus and
decides whether to create another one (up to the run's max-attempt cap).

PreviewCheckpoint: one row per AnalysisRun, created when Phase 8 (Install
-> Build -> Run & Test) finishes and the run pauses for a human decision.
promptMessages / fileEditsDetected are stored as JSON arrays (same
PortableJSON pattern as PipelinePhase.subprocesses) rather than their own
tables, since they're always read/written as a whole with the checkpoint
and never queried independently.
"""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import CheckpointStatus, FixAttemptMode, FixAttemptResult
from app.models.types import PortableJSON


class FixAttempt(Base):
    __tablename__ = "FixAttempt"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    bugId: Mapped[str] = mapped_column(ForeignKey("Bug.id", ondelete="CASCADE"), nullable=False)
    analysisRunId: Mapped[str] = mapped_column(ForeignKey("AnalysisRun.id", ondelete="CASCADE"), nullable=False)
    attemptNumber: Mapped[int] = mapped_column(Integer, nullable=False)  # 1, 2, 3...
    mode: Mapped[FixAttemptMode] = mapped_column(default=FixAttemptMode.automatic, nullable=False)
    triggerNote: Mapped[str | None] = mapped_column(String, nullable=True)  # prompt pad text, if manual
    triggerFileEdit: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    fixProposalId: Mapped[str | None] = mapped_column(ForeignKey("FixProposal.id", ondelete="SET NULL"), nullable=True)
    diffSnippet: Mapped[str] = mapped_column(String, nullable=False)
    previousAttemptId: Mapped[str | None] = mapped_column(ForeignKey("FixAttempt.id", ondelete="SET NULL"), nullable=True)
    resultStatus: Mapped[FixAttemptResult] = mapped_column(default=FixAttemptResult.pending, nullable=False)
    errorFingerprint: Mapped[str | None] = mapped_column(String, nullable=True)  # normalized hash, same-error detection
    rawErrorOutput: Mapped[str | None] = mapped_column(String, nullable=True)
    linesAdded: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    linesRemoved: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    bug: Mapped["Bug"] = relationship()
    analysisRun: Mapped["AnalysisRun"] = relationship(back_populates="fixAttempts")
    fixProposal: Mapped["FixProposal | None"] = relationship()
    previousAttempt: Mapped["FixAttempt | None"] = relationship(remote_side=[id])


class PreviewCheckpoint(Base):
    __tablename__ = "PreviewCheckpoint"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    analysisRunId: Mapped[str] = mapped_column(ForeignKey("AnalysisRun.id", ondelete="CASCADE"), nullable=False, unique=True)
    previewSessionId: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[CheckpointStatus] = mapped_column(default=CheckpointStatus.awaiting_decision, nullable=False)
    promptMessages: Mapped[list | None] = mapped_column(PortableJSON, default=list, nullable=True)
    fileEditsDetected: Mapped[list | None] = mapped_column(PortableJSON, default=list, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    resumedAt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    analysisRun: Mapped["AnalysisRun"] = relationship(back_populates="checkpoint")