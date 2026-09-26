import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import AIStatus, BugStatus, Severity
from app.models.types import PortableStringArray


class Bug(Base):
    __tablename__ = "Bug"
    __table_args__ = (
        UniqueConstraint("projectId", "code"),
        Index("ix_bug_project_status_severity", "projectId", "status", "severity"),
    )

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    projectId: Mapped[str] = mapped_column(ForeignKey("Project.id", ondelete="CASCADE"), nullable=False)
    analysisRunId: Mapped[str | None] = mapped_column(ForeignKey("AnalysisRun.id", ondelete="SET NULL"), nullable=True)
    code: Mapped[str] = mapped_column(String, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    tags: Mapped[list[str]] = mapped_column(PortableStringArray, default=list, nullable=False)
    severity: Mapped[Severity] = mapped_column(nullable=False)
    status: Mapped[BugStatus] = mapped_column(default=BugStatus.Open, nullable=False)
    aiStatus: Mapped[AIStatus] = mapped_column(default=AIStatus.Pending, nullable=False)
    language: Mapped[str] = mapped_column(String, nullable=False)
    component: Mapped[str] = mapped_column(String, nullable=False)
    filePath: Mapped[str | None] = mapped_column(String, nullable=True)
    lineNumber: Mapped[int | None] = mapped_column(Integer, nullable=True)
    stackTrace: Mapped[str | None] = mapped_column(String, nullable=True)
    fingerprint: Mapped[str | None] = mapped_column(String, nullable=True)
    loggedDate: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    project: Mapped["Project"] = relationship(back_populates="bugs")
    analysisRun: Mapped["AnalysisRun | None"] = relationship(back_populates="bugs")
    occurrences: Mapped[list["BugOccurrence"]] = relationship(back_populates="bug", cascade="all, delete-orphan")
    fixes: Mapped[list["FixProposal"]] = relationship(back_populates="bug", cascade="all, delete-orphan")


class BugOccurrence(Base):
    __tablename__ = "BugOccurrence"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    bugId: Mapped[str] = mapped_column(ForeignKey("Bug.id", ondelete="CASCADE"), nullable=False)
    errorId: Mapped[str | None] = mapped_column(String, nullable=True)
    lineNumber: Mapped[int | None] = mapped_column(Integer, nullable=True)
    filePath: Mapped[str | None] = mapped_column(String, nullable=True)
    observedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    bug: Mapped["Bug"] = relationship(back_populates="occurrences")


class ErrorRecord(Base):
    __tablename__ = "ErrorRecord"
    __table_args__ = (Index("ix_errorrecord_project_fingerprint", "projectId", "fingerprint"),)

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    projectId: Mapped[str] = mapped_column(ForeignKey("Project.id", ondelete="CASCADE"), nullable=False)
    analysisRunId: Mapped[str | None] = mapped_column(ForeignKey("AnalysisRun.id", ondelete="CASCADE"), nullable=True)
    fingerprint: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    message: Mapped[str] = mapped_column(String, nullable=False)
    stackTrace: Mapped[str | None] = mapped_column(String, nullable=True)
    filePath: Mapped[str | None] = mapped_column(String, nullable=True)
    lineNumber: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source: Mapped[str | None] = mapped_column(String, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped["Project"] = relationship(back_populates="errors")
    analysisRun: Mapped["AnalysisRun | None"] = relationship(back_populates="errors")
