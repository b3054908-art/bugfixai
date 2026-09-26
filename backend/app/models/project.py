import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import ProjectStatus, SourceType


class Project(Base):
    __tablename__ = "Project"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    ownerId: Mapped[str] = mapped_column(ForeignKey("User.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    sourceType: Mapped[SourceType] = mapped_column(nullable=False)
    status: Mapped[ProjectStatus] = mapped_column(default=ProjectStatus.READY, nullable=False)
    repositoryUrl: Mapped[str | None] = mapped_column(String, nullable=True)
    defaultBranch: Mapped[str | None] = mapped_column(String, nullable=True)
    currentCommit: Mapped[str | None] = mapped_column(String, nullable=True)
    sourcePath: Mapped[str | None] = mapped_column(String, nullable=True)
    workspacePath: Mapped[str | None] = mapped_column(String, nullable=True)
    language: Mapped[str | None] = mapped_column(String, nullable=True)
    framework: Mapped[str | None] = mapped_column(String, nullable=True)
    previewCommand: Mapped[str | None] = mapped_column(String, nullable=True)
    previewPort: Mapped[int | None] = mapped_column(nullable=True)
    entryPoint: Mapped[str | None] = mapped_column(String, nullable=True)
    databaseType: Mapped[str | None] = mapped_column(String, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    owner: Mapped["User"] = relationship(back_populates="projects")
    runs: Mapped[list["AnalysisRun"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    bugs: Mapped[list["Bug"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    fixes: Mapped[list["FixProposal"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    contextDocuments: Mapped[list["ContextDocument"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    workspace: Mapped["Workspace | None"] = relationship(back_populates="project", cascade="all, delete-orphan")
    tests: Mapped[list["TestRun"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    events: Mapped[list["AnalyticsEvent"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    gitOperations: Mapped[list["GitOperation"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    setting: Mapped["ProjectSetting | None"] = relationship(back_populates="project", cascade="all, delete-orphan")
    errors: Mapped[list["ErrorRecord"]] = relationship(back_populates="project", cascade="all, delete-orphan")
