from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl


class CreateProjectRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    sourceType: Literal["ZIP", "GITHUB", "PASTE"]
    repositoryUrl: HttpUrl | None = None
    defaultBranch: str | None = Field(default=None, min_length=1, max_length=200)


class WorkspaceOut(BaseModel):
    id: str
    rootPath: str

    model_config = {"from_attributes": True}


class ProjectSettingOut(BaseModel):
    id: str
    autoRunTests: bool
    minimumConfidence: int
    sandboxGuardrails: bool
    maxCpu: float
    maxMemory: str
    timeoutSeconds: int

    model_config = {"from_attributes": True}


class ProjectOut(BaseModel):
    id: str
    ownerId: str
    name: str
    sourceType: str
    status: str
    repositoryUrl: str | None
    defaultBranch: str | None
    currentCommit: str | None
    sourcePath: str | None
    workspacePath: str | None
    language: str | None
    framework: str | None
    previewCommand: str | None
    previewPort: int | None
    createdAt: datetime
    updatedAt: datetime
    workspace: WorkspaceOut | None = None
    setting: ProjectSettingOut | None = None

    model_config = {"from_attributes": True}


class ProjectListResponse(BaseModel):
    items: list[ProjectOut]
    page: int
    limit: int
    total: int
