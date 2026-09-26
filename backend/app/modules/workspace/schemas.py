from typing import Literal

from pydantic import BaseModel


class TreeNode(BaseModel):
    name: str
    path: str
    type: Literal["folder", "file"]
    children: list["TreeNode"] | None = None


TreeNode.model_rebuild()


class FileContent(BaseModel):
    path: str
    content: str


class WriteFileRequest(BaseModel):
    path: str
    content: str


class WriteFileResponse(BaseModel):
    path: str


class ExecRequest(BaseModel):
    command: str
    # Workspace-relative directory (no leading slash) the command should run
    # from, e.g. "backend". Empty/omitted means the workspace root. The
    # client round-trips this from the previous ExecResult.cwd so `cd`
    # persists across commands even though each one runs in a fresh,
    # disposable sandbox container -- see exec_command() for how.
    cwd: str = ""


class ExecResult(BaseModel):
    stdout: str
    stderr: str
    code: int
    durationMs: int
    # Workspace-relative directory the shell ended up in after this command
    # (reflects any `cd` the command itself did). Echo this back as the next
    # request's `cwd` to keep a persistent-feeling shell session.
    cwd: str


class SearchMatch(BaseModel):
    file: str
    line: int
    preview: str


class GitStatusEntry(BaseModel):
    path: str
    status: str


class GitStatusResult(BaseModel):
    branch: str
    entries: list[GitStatusEntry]


class GitDiffResponse(BaseModel):
    diff: str


class GitCommitRequest(BaseModel):
    message: str


class GitCommitResponse(BaseModel):
    committed: bool


class DeleteResponse(BaseModel):
    path: str
    deleted: bool


class RenameRequest(BaseModel):
    oldPath: str
    newPath: str


class RenameResponse(BaseModel):
    oldPath: str
    newPath: str


class CreateFolderRequest(BaseModel):
    path: str


class CreateFolderResponse(BaseModel):
    path: str
