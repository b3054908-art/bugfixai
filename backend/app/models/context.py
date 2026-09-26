import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID

from app.models.types import PortableJSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ContextDocument(Base):
    __tablename__ = "ContextDocument"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    projectId: Mapped[str] = mapped_column(ForeignKey("Project.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    storagePath: Mapped[str] = mapped_column(String, nullable=False)
    sizeBytes: Mapped[int] = mapped_column(Integer, nullable=False)
    type: Mapped[str] = mapped_column(String, nullable=False)
    contentText: Mapped[str | None] = mapped_column(String, nullable=True)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    indexedAt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    project: Mapped["Project"] = relationship(back_populates="contextDocuments")
    chunks: Mapped[list["ContextChunk"]] = relationship(back_populates="document", cascade="all, delete-orphan")


class ContextChunk(Base):
    __tablename__ = "ContextChunk"
    __table_args__ = (UniqueConstraint("documentId", "ordinal"),)

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    documentId: Mapped[str] = mapped_column(ForeignKey("ContextDocument.id", ondelete="CASCADE"), nullable=False)
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(String, nullable=False)
    metadata_: Mapped[dict | None] = mapped_column("metadata", PortableJSON, nullable=True)

    document: Mapped["ContextDocument"] = relationship(back_populates="chunks")


class Workspace(Base):
    __tablename__ = "Workspace"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    projectId: Mapped[str] = mapped_column(ForeignKey("Project.id", ondelete="CASCADE"), unique=True, nullable=False)
    rootPath: Mapped[str] = mapped_column(String, nullable=False)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    project: Mapped["Project"] = relationship(back_populates="workspace")
