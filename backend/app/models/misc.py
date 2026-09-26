import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID

from app.models.types import PortableJSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class GitOperation(Base):
    __tablename__ = "GitOperation"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    projectId: Mapped[str] = mapped_column(ForeignKey("Project.id", ondelete="CASCADE"), nullable=False)
    operation: Mapped[str] = mapped_column(String, nullable=False)
    branch: Mapped[str | None] = mapped_column(String, nullable=True)
    commit: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False)
    message: Mapped[str | None] = mapped_column(String, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped["Project"] = relationship(back_populates="gitOperations")


class AnalyticsEvent(Base):
    __tablename__ = "AnalyticsEvent"
    __table_args__ = (Index("ix_analyticsevent_user_name_created", "userId", "name", "createdAt"),)

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    projectId: Mapped[str | None] = mapped_column(ForeignKey("Project.id", ondelete="CASCADE"), nullable=True)
    userId: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    value: Mapped[float | None] = mapped_column(Float, nullable=True)
    metadata_: Mapped[dict | None] = mapped_column("metadata", PortableJSON, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped["Project | None"] = relationship(back_populates="events")
