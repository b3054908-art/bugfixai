import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, Index, func
from sqlalchemy.dialects.postgresql import UUID

from app.models.types import PortableJSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import AnalysisStatus, PhaseStatus, ValidationStatus


class AnalysisRun(Base):
    __tablename__ = "AnalysisRun"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    projectId: Mapped[str] = mapped_column(ForeignKey("Project.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[AnalysisStatus] = mapped_column(default=AnalysisStatus.QUEUED, nullable=False)
    requestedBy: Mapped[str] = mapped_column(String, nullable=False)
    startedAt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completedAt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    errorMessage: Mapped[str | None] = mapped_column(String, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    project: Mapped["Project"] = relationship(back_populates="runs")
    phases: Mapped[list["PipelinePhase"]] = relationship(back_populates="analysisRun", cascade="all, delete-orphan")
    logs: Mapped[list["PipelineLog"]] = relationship(back_populates="analysisRun", cascade="all, delete-orphan")
    bugs: Mapped[list["Bug"]] = relationship(back_populates="analysisRun")
    tests: Mapped[list["TestRun"]] = relationship(back_populates="analysisRun")
    errors: Mapped[list["ErrorRecord"]] = relationship(back_populates="analysisRun")
    fixes: Mapped[list["FixProposal"]] = relationship(back_populates="analysisRun")
    fixAttempts: Mapped[list["FixAttempt"]] = relationship(back_populates="analysisRun", cascade="all, delete-orphan")
    checkpoint: Mapped["PreviewCheckpoint | None"] = relationship(back_populates="analysisRun", uselist=False, cascade="all, delete-orphan")
    maxAttempts: Mapped[int] = mapped_column(Integer, default=3, nullable=False)


class PipelinePhase(Base):
    __tablename__ = "PipelinePhase"
    __table_args__ = (UniqueConstraint("analysisRunId", "number"),)

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    analysisRunId: Mapped[str] = mapped_column(ForeignKey("AnalysisRun.id", ondelete="CASCADE"), nullable=False)
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[PhaseStatus] = mapped_column(default=PhaseStatus.PENDING, nullable=False)
    durationMs: Mapped[int | None] = mapped_column(Integer, nullable=True)
    validationStatus: Mapped[ValidationStatus] = mapped_column(default=ValidationStatus.IDLE, nullable=False)
    validationReport: Mapped[dict | None] = mapped_column(PortableJSON, nullable=True)
    subprocesses: Mapped[dict | None] = mapped_column(PortableJSON, nullable=True)
    startedAt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completedAt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    analysisRun: Mapped["AnalysisRun"] = relationship(back_populates="phases")
    logs: Mapped[list["PipelineLog"]] = relationship(back_populates="phase")


class PipelineLog(Base):
    __tablename__ = "PipelineLog"
    __table_args__ = (Index("ix_pipelinelog_run_timestamp", "analysisRunId", "timestamp"),)

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    analysisRunId: Mapped[str] = mapped_column(ForeignKey("AnalysisRun.id", ondelete="CASCADE"), nullable=False)
    phaseId: Mapped[str | None] = mapped_column(ForeignKey("PipelinePhase.id", ondelete="SET NULL"), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    level: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str] = mapped_column(String, nullable=False)
    message: Mapped[str] = mapped_column(String, nullable=False)
    metadata_: Mapped[dict | None] = mapped_column("metadata", PortableJSON, nullable=True)

    analysisRun: Mapped["AnalysisRun"] = relationship(back_populates="logs")
    phase: Mapped["PipelinePhase | None"] = relationship(back_populates="logs")