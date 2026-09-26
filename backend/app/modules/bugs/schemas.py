"""Mirrors: backend/src/modules/bugs/bug.controller.ts (zod schemas)"""
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CreateBugRequest(BaseModel):
    projectId: str
    title: str = Field(min_length=1, max_length=300)
    description: str | None = Field(default=None, max_length=20000)
    severity: str
    language: str = Field(min_length=1, max_length=80)
    component: str = Field(min_length=1, max_length=160)
    filePath: str | None = Field(default=None, max_length=1000)
    lineNumber: int | None = Field(default=None, gt=0)
    stackTrace: str | None = Field(default=None, max_length=50000)
    tags: list[str] = Field(default_factory=list, max_length=20)


class UpdateBugRequest(BaseModel):
    status: str | None = None
    severity: str | None = None
    tags: list[str] | None = Field(default=None, max_length=20)


class BugOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    projectId: str
    analysisRunId: str | None
    code: str
    title: str
    description: str | None
    tags: list[str]
    severity: str
    status: str
    aiStatus: str
    language: str
    component: str
    filePath: str | None
    lineNumber: int | None
    stackTrace: str | None
    fingerprint: str | None
    loggedDate: datetime
    updatedAt: datetime


class BugListResponse(BaseModel):
    items: list[BugOut]
    page: int
    limit: int
    total: int
