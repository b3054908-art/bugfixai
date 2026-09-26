import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.types import PortableJSON, PortableStringArray

from app.db.base import Base
from app.models.enums import FixStatus, Provider, ValidationStatus


class FixProposal(Base):
    __tablename__ = "FixProposal"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    bugId: Mapped[str] = mapped_column(ForeignKey("Bug.id", ondelete="CASCADE"), nullable=False)
    projectId: Mapped[str] = mapped_column(ForeignKey("Project.id", ondelete="CASCADE"), nullable=False)
    analysisRunId: Mapped[str | None] = mapped_column(ForeignKey("AnalysisRun.id", ondelete="SET NULL"), nullable=True)
    provider: Mapped[Provider] = mapped_column(nullable=False)
    model: Mapped[str] = mapped_column(String, nullable=False)
    confidence: Mapped[int] = mapped_column(Integer, nullable=False)
    explanation: Mapped[str] = mapped_column(String, nullable=False)
    patchSummary: Mapped[str] = mapped_column(String, nullable=False)
    unifiedDiff: Mapped[str] = mapped_column(String, nullable=False)
    originalCode: Mapped[str | None] = mapped_column(String, nullable=True)
    proposedCode: Mapped[str | None] = mapped_column(String, nullable=True)
    affectedFiles: Mapped[list[str]] = mapped_column(PortableStringArray, default=list, nullable=False)
    linesChanged: Mapped[int] = mapped_column(Integer, nullable=False)
    estimatedMinutes: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[FixStatus] = mapped_column(default=FixStatus.Ready, nullable=False)
    validationStatus: Mapped[ValidationStatus] = mapped_column(default=ValidationStatus.IDLE, nullable=False)
    validationReport: Mapped[dict | None] = mapped_column(PortableJSON, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    appliedAt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    bug: Mapped["Bug"] = relationship(back_populates="fixes")
    project: Mapped["Project"] = relationship(back_populates="fixes")
    analysisRun: Mapped["AnalysisRun | None"] = relationship(back_populates="fixes")
    validations: Mapped[list["FixValidation"]] = relationship(back_populates="fix", cascade="all, delete-orphan")


class FixValidation(Base):
    __tablename__ = "FixValidation"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    fixId: Mapped[str] = mapped_column(ForeignKey("FixProposal.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[ValidationStatus] = mapped_column(nullable=False)
    testPassRate: Mapped[str] = mapped_column(String, nullable=False)
    totalTests: Mapped[int] = mapped_column(Integer, nullable=False)
    passedTests: Mapped[int] = mapped_column(Integer, nullable=False)
    failedTests: Mapped[int] = mapped_column(Integer, nullable=False)
    regressionFound: Mapped[bool] = mapped_column(Boolean, nullable=False)
    recommendation: Mapped[str] = mapped_column(String, nullable=False)
    summary: Mapped[str] = mapped_column(String, nullable=False)
    diffSnippet: Mapped[str | None] = mapped_column(String, nullable=True)
    cycleCount: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    fix: Mapped["FixProposal"] = relationship(back_populates="validations")


class TestRun(Base):
    __tablename__ = "TestRun"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    projectId: Mapped[str] = mapped_column(ForeignKey("Project.id", ondelete="CASCADE"), nullable=False)
    analysisRunId: Mapped[str | None] = mapped_column(ForeignKey("AnalysisRun.id", ondelete="CASCADE"), nullable=True)
    command: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    passed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    failed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    skipped: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    durationMs: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    stdout: Mapped[str | None] = mapped_column(String, nullable=True)
    stderr: Mapped[str | None] = mapped_column(String, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped["Project"] = relationship(back_populates="tests")
    analysisRun: Mapped["AnalysisRun | None"] = relationship(back_populates="tests")
