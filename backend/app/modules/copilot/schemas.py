"""Mirrors: backend/src/modules/copilot/copilot.controller.ts (zod schemas)"""
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CreateConversationRequest(BaseModel):
    projectId: str | None = None


class SendMessageRequest(BaseModel):
    text: str = Field(min_length=1, max_length=20000)
    provider: str | None = None
    model: str | None = None
    filePath: str | None = None


class SetProposalStatusRequest(BaseModel):
    status: str


class ProposalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    file: str
    title: str
    description: str
    explanation: str
    startLine: int
    endLine: int
    originalCode: str
    proposedCode: str
    diffSummary: str
    status: str


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    sender: str
    text: str
    modelUsed: str | None
    provider: str | None
    createdAt: datetime
    proposal: ProposalOut | None = None


class ConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    userId: str
    projectId: str | None
    createdAt: datetime
    messages: list[MessageOut] = Field(default_factory=list)