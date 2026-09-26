"""Mirrors: backend/src/modules/fixes/fix.controller.ts (zod schemas)"""
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class GenerateFixRequest(BaseModel):
    bugId: str
    provider: str | None = None
    model: str | None = None


class ValidateFixRequest(BaseModel):
    command: str = Field(default="npm test", min_length=1, max_length=1000)


class FixOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    bugId: str
    projectId: str
    analysisRunId: str | None
    provider: str
    model: str
    confidence: int
    explanation: str
    patchSummary: str
    unifiedDiff: str
    originalCode: str | None
    proposedCode: str | None
    affectedFiles: list[str]
    linesChanged: int
    estimatedMinutes: int
    status: str
    validationStatus: str
    createdAt: datetime
    appliedAt: datetime | None
