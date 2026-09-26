import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import Provider


class AIModelConfig(Base):
    __tablename__ = "AIModelConfig"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    provider: Mapped[Provider] = mapped_column(nullable=False)
    modelId: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    displayName: Mapped[str] = mapped_column(String, nullable=False)
    contextWindow: Mapped[str] = mapped_column(String, nullable=False)
    latency: Mapped[str | None] = mapped_column(String, nullable=True)
    description: Mapped[str] = mapped_column(String, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class ProviderCredential(Base):
    __tablename__ = "ProviderCredential"
    __table_args__ = (UniqueConstraint("userId", "provider"),)

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    userId: Mapped[str] = mapped_column(ForeignKey("User.id", ondelete="CASCADE"), nullable=False)
    provider: Mapped[Provider] = mapped_column(nullable=False)
    encryptedKey: Mapped[str] = mapped_column(String, nullable=False)
    baseUrl: Mapped[str | None] = mapped_column(String, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user: Mapped["User"] = relationship(back_populates="credentials")


class UserSetting(Base):
    __tablename__ = "UserSetting"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    userId: Mapped[str] = mapped_column(ForeignKey("User.id", ondelete="CASCADE"), unique=True, nullable=False)
    primaryProvider: Mapped[Provider] = mapped_column(default=Provider.openai, nullable=False)
    primaryModel: Mapped[str] = mapped_column(String, default="gpt-4o-mini", nullable=False)
    autoRunTests: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    minimumConfidence: Mapped[int] = mapped_column(Integer, default=85, nullable=False)
    sandboxGuardrails: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    user: Mapped["User"] = relationship(back_populates="settings")


class ProjectSetting(Base):
    __tablename__ = "ProjectSetting"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    projectId: Mapped[str] = mapped_column(ForeignKey("Project.id", ondelete="CASCADE"), unique=True, nullable=False)
    autoRunTests: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    minimumConfidence: Mapped[int] = mapped_column(Integer, default=85, nullable=False)
    sandboxGuardrails: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    maxCpu: Mapped[float] = mapped_column(Float, default=2, nullable=False)
    maxMemory: Mapped[str] = mapped_column(String, default="4g", nullable=False)
    timeoutSeconds: Mapped[int] = mapped_column(Integer, default=300, nullable=False)

    project: Mapped["Project"] = relationship(back_populates="setting")
