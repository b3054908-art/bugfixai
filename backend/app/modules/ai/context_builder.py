"""Mirrors: backend/src/modules/ai/context-builder.ts

UPDATED: the original version only read a single file from
`project.workspacePath` — a plain string column on Project that the
browser IDE never populates. The IDE's real files live under the
separate `Workspace` row (Workspace.rootPath), the same one
app.modules.workspace.service already reads/writes for the file
explorer and editor. This version additionally pulls a file listing
and relevant file contents from that real workspace, so the AI can
actually see what's in the IDE. Nothing from the original payload
shape was removed — `workspaceFiles` is a new, additive key.
"""
import json
import os
from typing import Awaitable, Callable

import aiofiles
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.common.errors.app_error import AppError
from app.models.bug import Bug
from app.models.context import ContextChunk, ContextDocument, Workspace
from app.models.project import Project
from app.modules.workspace.service import read_file as ws_read_file
from app.modules.workspace.service import tree as ws_tree

_MAX_LISTED_PATHS = 200
_MAX_FILES_INCLUDED = 5
_MAX_FILE_CHARS = 4000


def _flatten_tree(nodes, out: list[str]) -> None:
    for node in nodes:
        if node.type == "file":
            out.append(node.path)
        elif node.children:
            _flatten_tree(node.children, out)


async def _gather_live_workspace_context(
    db: AsyncSession,
    user_id: str,
    project_id: str,
    file_path: str | None,
    question: str | None,
    bug_file_path: str | None,
) -> dict:
    """Reads the real IDE workspace (Workspace.rootPath) for this project:
    a file listing, plus the content of any files that are explicitly
    relevant (an explicit file_path, the bug's recorded filePath, or a
    file whose name is mentioned in the user's question)."""
    stmt = select(Workspace).where(Workspace.projectId == project_id)
    workspace = (await db.execute(stmt)).scalar_one_or_none()
    if workspace is None:
        return {"listing": [], "included": []}

    try:
        nodes = await ws_tree(db, user_id, workspace.id)
    except AppError:
        return {"listing": [], "included": []}

    paths: list[str] = []
    _flatten_tree(nodes, paths)
    if not paths:
        return {"listing": [], "included": []}

    wanted: list[str] = []
    if file_path and file_path in paths:
        wanted.append(file_path)
    if bug_file_path and bug_file_path in paths and bug_file_path not in wanted:
        wanted.append(bug_file_path)
    if question:
        lower_question = question.lower()
        for path in paths:
            if len(wanted) >= _MAX_FILES_INCLUDED:
                break
            if path in wanted:
                continue
            if path.lower() in lower_question or path.split("/")[-1].lower() in lower_question:
                wanted.append(path)

    included = []
    for path in wanted[:_MAX_FILES_INCLUDED]:
        try:
            result = await ws_read_file(db, user_id, workspace.id, path)
        except AppError:
            continue
        included.append({"path": path, "content": result["content"][:_MAX_FILE_CHARS]})

    return {"listing": paths[:_MAX_LISTED_PATHS], "included": included}


async def build_ai_context(
    db: AsyncSession,
    project_id: str,
    user_id: str | None = None,
    bug_id: str | None = None,
    file_path: str | None = None,
    line_number: int | None = None,
    question: str | None = None,
    on_understand: Callable[[], Awaitable[None]] | None = None,
    on_trace: Callable[[], Awaitable[None]] | None = None,
) -> str:
    """`on_understand` fires the moment the bug's own reported fields
    (title/description/severity/stackTrace/filePath/lineNumber) are loaded --
    the "Understand error" step. `on_trace` fires once the real IDE
    workspace has been read (or definitively has nothing to read) --
    the "Trace relevant code" step. Both are optional so every other
    caller (copilot chat, etc.) is unaffected."""
    stmt = (
        select(Project)
        .where(Project.id == project_id)
        .options(
            selectinload(Project.contextDocuments).selectinload(ContextDocument.chunks)
        )
    )
    project = (await db.execute(stmt)).scalar_one_or_none()
    if project is None:
        raise AppError(404, "PROJECT_NOT_FOUND", "Project was not found")

    bug = None
    if bug_id:
        bug_stmt = select(Bug).where(Bug.id == bug_id, Bug.projectId == project_id)
        bug = (await db.execute(bug_stmt)).scalar_one_or_none()
    else:
        bug_stmt = (
            select(Bug)
            .where(Bug.projectId == project_id)
            .order_by(Bug.updatedAt.desc())
            .limit(1)
        )
        bug = (await db.execute(bug_stmt)).scalar_one_or_none()

    if on_understand:
        # The bug's own reported facts (title, description, severity,
        # stackTrace, filePath, lineNumber) are now loaded from the DB --
        # this is the real "Understand error" step, done before any code
        # is touched.
        await on_understand()

    source = ""
    if project.workspacePath and file_path:
        full = os.path.join(project.workspacePath, file_path)
        try:
            async with aiofiles.open(full, "r", encoding="utf-8") as f:
                source = await f.read()
        except (FileNotFoundError, UnicodeDecodeError, OSError):
            source = ""

    workspace_files = {"listing": [], "included": []}
    if user_id:
        workspace_files = await _gather_live_workspace_context(
            db,
            user_id,
            project_id,
            file_path,
            question,
            bug.filePath if bug else None,
        )
        # If the plain project.workspacePath lookup above came up empty,
        # fall back to whatever the live IDE workspace read for the same
        # file_path — this is the fix for files created in the browser IDE.
        if not source and file_path:
            for entry in workspace_files["included"]:
                if entry["path"] == file_path:
                    source = entry["content"]
                    break

    if on_trace:
        # Real workspace source (or a confirmed "nothing to read" for this
        # project) has now been gathered -- the "Trace relevant code" step.
        await on_trace()

    context_docs = []
    for doc in project.contextDocuments:
        chunks_sorted = sorted(doc.chunks, key=lambda c: c.ordinal)[:20]
        content = doc.contentText or "\n".join(c.content for c in chunks_sorted)
        context_docs.append({"name": doc.name, "type": doc.type, "content": content})

    payload = {
        "project": {
            "id": project.id,
            "name": project.name,
            "language": project.language,
            "framework": project.framework,
            "database": (
                {"type": project.databaseType, "sidecarSupported": project.databaseType in ("postgres", "mysql")}
                if project.databaseType
                else None
            ),
        },
        "bug": (
            {
                "id": bug.id,
                "code": bug.code,
                "title": bug.title,
                "description": bug.description,
                "severity": bug.severity,
                "component": bug.component,
                "filePath": bug.filePath,
                "lineNumber": bug.lineNumber,
                "stackTrace": bug.stackTrace,
            }
            if bug
            else None
        ),
        "question": question,
        "filePath": file_path,
        "lineNumber": line_number,
        "source": source,
        "contextDocuments": context_docs,
        "workspaceFiles": workspace_files,
    }
    return json.dumps(payload, default=str)
