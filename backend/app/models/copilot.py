import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import ProposalStatus


class CopilotConversation(Base):
    __tablename__ = "CopilotConversation"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    userId: Mapped[str] = mapped_column(ForeignKey("User.id", ondelete="CASCADE"), nullable=False)
    projectId: Mapped[str | None] = mapped_column(String, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user: Mapped["User"] = relationship(back_populates="conversations")
    messages: Mapped[list["CopilotMessage"]] = relationship(back_populates="conversation", cascade="all, delete-orphan")
    proposals: Mapped[list["CodeChangeProposal"]] = relationship(back_populates="conversation", cascade="all, delete-orphan")


class CopilotMessage(Base):
    __tablename__ = "CopilotMessage"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    conversationId: Mapped[str] = mapped_column(ForeignKey("CopilotConversation.id", ondelete="CASCADE"), nullable=False)
    sender: Mapped[str] = mapped_column(String, nullable=False)
    text: Mapped[str] = mapped_column(String, nullable=False)
    modelUsed: Mapped[str | None] = mapped_column(String, nullable=True)
    provider: Mapped[str | None] = mapped_column(String, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    conversation: Mapped["CopilotConversation"] = relationship(back_populates="messages")
    proposal: Mapped["CodeChangeProposal | None"] = relationship(back_populates="message", cascade="all, delete-orphan")


class CodeChangeProposal(Base):
    __tablename__ = "CodeChangeProposal"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    conversationId: Mapped[str] = mapped_column(ForeignKey("CopilotConversation.id", ondelete="CASCADE"), nullable=False)
    messageId: Mapped[str] = mapped_column(ForeignKey("CopilotMessage.id", ondelete="CASCADE"), unique=True, nullable=False)
    file: Mapped[str] = mapped_column(String, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(String, nullable=False)
    explanation: Mapped[str] = mapped_column(String, nullable=False)
    startLine: Mapped[int] = mapped_column(Integer, nullable=False)
    endLine: Mapped[int] = mapped_column(Integer, nullable=False)
    originalCode: Mapped[str] = mapped_column(String, nullable=False)
    proposedCode: Mapped[str] = mapped_column(String, nullable=False)
    diffSummary: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[ProposalStatus] = mapped_column(default=ProposalStatus.PENDING_PERMISSION, nullable=False)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    conversation: Mapped["CopilotConversation"] = relationship(back_populates="proposals")
    message: Mapped["CopilotMessage"] = relationship(back_populates="proposal")
