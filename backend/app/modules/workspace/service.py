"""Mirrors: backend/src/modules/workspace/workspace.service.ts"""
import asyncio
import os
import shutil

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.common.errors.app_error import AppError
from app.common.utils.safe_path import resolve_safe_path
from app.models.context import Workspace
from app.models.project import Project
from app.modules.sandbox.sandbox_service import run_sandbox
from app.modules.workspace.schemas import (
    ExecResult,
    GitStatusEntry,
    GitStatusResult,
    SearchMatch,
    TreeNode,
)

SKIP_DIRS = {".git", "node_modules", ".venv", "dist", "build"}
SEARCH_SKIP_DIRS = SKIP_DIRS | {"sandbox-work"}
SEARCH_MAX_MATCHES = 200
SEARCH_MAX_FILE_BYTES = 1_000_000
SEARCH_MAX_FILES = 2000


async def workspace_for(db: AsyncSession, user_id: str, workspace_id: str) -> Workspace:
    stmt = (
        select(Workspace)
        .join(Project, Workspace.projectId == Project.id)
        .where(Workspace.id == workspace_id, Project.ownerId == user_id)
        .options(selectinload(Workspace.project))
    )
    ws = (await db.execute(stmt)).scalar_one_or_none()
    if ws is None:
        raise AppError(404, "WORKSPACE_NOT_FOUND", "Workspace was not found")
    return ws


def _walk(root: str, current: str, depth: int) -> list[TreeNode]:
    if depth > 20:
        return []
    result: list[TreeNode] = []
    try:
        entries = list(os.scandir(current))
    except FileNotFoundError:
        return []
    for entry in entries:
        if entry.name in SKIP_DIRS:
            continue
        full = os.path.join(current, entry.name)
        rel = os.path.relpath(full, root)
        if entry.is_dir():
            result.append(TreeNode(name=entry.name, path=rel, type="folder", children=_walk(root, full, depth + 1)))
        else:
            result.append(TreeNode(name=entry.name, path=rel, type="file"))
    result.sort(key=lambda n: (0 if n.type == "folder" else 1, n.name.lower()))
    return result


async def tree(db: AsyncSession, user_id: str, workspace_id: str) -> list[TreeNode]:
    ws = await workspace_for(db, user_id, workspace_id)
    return await asyncio.to_thread(_walk, ws.rootPath, ws.rootPath, 0)


async def read_file(db: AsyncSession, user_id: str, workspace_id: str, file: str) -> dict:
    ws = await workspace_for(db, user_id, workspace_id)
    target = resolve_safe_path(ws.rootPath, file)
    if not os.path.isfile(target):
        raise AppError(400, "NOT_A_FILE", "The requested path is not a file")
    if os.path.getsize(target) > 2_000_000:
        raise AppError(413, "FILE_TOO_LARGE", "Workspace file exceeds the editor limit")
    with open(target, "r", encoding="utf-8") as f:
        content = f.read()
    return {"path": file, "content": content}


async def write_file(db: AsyncSession, user_id: str, workspace_id: str, file: str, content: str) -> dict:
    ws = await workspace_for(db, user_id, workspace_id)
    if len(content) > 5_000_000:
        raise AppError(413, "CONTENT_TOO_LARGE", "File content exceeds the editor limit")
    target = resolve_safe_path(ws.rootPath, file)
    os.makedirs(os.path.dirname(target), exist_ok=True)
    with open(target, "w", encoding="utf-8") as f:
        f.write(content)
    return {"path": file}


async def delete_path(db: AsyncSession, user_id: str, workspace_id: str, path: str) -> dict:
    ws = await workspace_for(db, user_id, workspace_id)
    trimmed = path.strip().strip("/")
    if not trimmed:
        raise AppError(400, "INVALID_PATH", "Cannot delete the workspace root")
    target = resolve_safe_path(ws.rootPath, trimmed)
    if not os.path.exists(target):
        raise AppError(404, "PATH_NOT_FOUND", "The requested path does not exist")
    if os.path.isdir(target):
        await asyncio.to_thread(shutil.rmtree, target)
    else:
        await asyncio.to_thread(os.remove, target)
    return {"path": trimmed, "deleted": True}


async def rename_path(db: AsyncSession, user_id: str, workspace_id: str, old_path: str, new_path: str) -> dict:
    ws = await workspace_for(db, user_id, workspace_id)
    old_trimmed = old_path.strip().strip("/")
    new_trimmed = new_path.strip().strip("/")
    if not old_trimmed or not new_trimmed:
        raise AppError(400, "INVALID_PATH", "Both oldPath and newPath are required")
    source = resolve_safe_path(ws.rootPath, old_trimmed)
    dest = resolve_safe_path(ws.rootPath, new_trimmed)
    if not os.path.exists(source):
        raise AppError(404, "PATH_NOT_FOUND", "The item to rename does not exist")
    if os.path.exists(dest):
        raise AppError(409, "PATH_EXISTS", "A file or folder already exists at the destination")
    dest_parent = os.path.dirname(dest) or ws.rootPath
    os.makedirs(dest_parent, exist_ok=True)
    await asyncio.to_thread(os.rename, source, dest)
    return {"oldPath": old_trimmed, "newPath": new_trimmed}


async def create_folder(db: AsyncSession, user_id: str, workspace_id: str, path: str) -> dict:
    ws = await workspace_for(db, user_id, workspace_id)
    trimmed = path.strip().strip("/")
    if not trimmed:
        raise AppError(400, "INVALID_PATH", "Folder path is required")
    target = resolve_safe_path(ws.rootPath, trimmed)
    if os.path.exists(target):
        raise AppError(409, "PATH_EXISTS", "A file or folder already exists at this path")
    await asyncio.to_thread(os.makedirs, target)
    return {"path": trimmed}


# --- Terminal: runs inside the Docker sandbox module (app.modules.sandbox). ---
#
# Each command still runs in its own fresh, disposable container (see
# container_manager.execute_in_docker: `docker run --rm ...`) -- there is no
# long-lived shell process to keep state in. To still make `cd` feel
# persistent across commands the way a real terminal does, every exec:
#   1. cd's into the *previous* result's ending directory before running the
#      user's command (passed in as ExecRequest.cwd, sourced from an env var
#      rather than interpolated into the script, so it can't break out of
#      the shell string no matter what a client sends).
#   2. appends a trailing marker line that captures the real `pwd` and exit
#      code of the user's command specifically (not of our wrapper's own
#      trailing commands, which would otherwise always report 0).
#   3. parses that marker back out before returning stdout, and reports the
#      resulting directory as ExecResult.cwd for the client to send next time.
_CWD_MARKER = "###BUGFIXER_EXEC_STATE###"


def _normalize_cwd(cwd: str) -> str:
    """Workspace-relative dir, no leading/trailing slashes, no `..` escape."""
    cleaned = (cwd or "").strip().strip("/")
    if not cleaned:
        return ""
    normalized = os.path.normpath(cleaned).replace(os.sep, "/")
    if normalized == "." :
        return ""
    if normalized == ".." or normalized.startswith("../"):
        return ""  # don't let a stale/tampered cwd wander outside the workspace
    return normalized


async def exec_command(db: AsyncSession, user_id: str, workspace_id: str, command: str, cwd: str = "") -> ExecResult:
    ws = await workspace_for(db, user_id, workspace_id)
    if not command.strip():
        raise AppError(400, "EMPTY_COMMAND", "Command is required")

    start_cwd = _normalize_cwd(cwd)
    wrapped = (
        'cd "/workspace/$BF_START_CWD" 2>/dev/null || cd /workspace; '
        f"{command}\n"
        f'__bf_ec=$?; printf "\\n{_CWD_MARKER}%s|%s\\n" "$(pwd)" "$__bf_ec"'
    )

    try:
        result = await run_sandbox(ws.rootPath, wrapped, extra_env={"BF_START_CWD": start_cwd})
    except FileNotFoundError as exc:
        # `docker` CLI isn't installed / on PATH in this environment.
        raise AppError(
            503,
            "SANDBOX_UNAVAILABLE",
            "The sandboxed terminal needs Docker on the server (and /var/run/docker.sock mounted "
            "into the backend/worker container, per docker-compose.yml). Docker isn't reachable here.",
        ) from exc
    except OSError as exc:
        raise AppError(503, "SANDBOX_UNAVAILABLE", f"Could not start the sandbox container: {exc}") from exc

    stdout = result.stdout
    exit_code = result.code
    end_cwd = start_cwd
    marker_idx = stdout.rfind(_CWD_MARKER)
    if marker_idx != -1:
        visible_stdout = stdout[:marker_idx].rstrip("\n")
        tail = stdout[marker_idx + len(_CWD_MARKER):].strip()
        pwd_part, _, ec_part = tail.partition("|")
        if pwd_part.startswith("/workspace"):
            end_cwd = _normalize_cwd(pwd_part[len("/workspace"):])
        if ec_part.strip().lstrip("-").isdigit():
            exit_code = int(ec_part.strip())
        stdout = visible_stdout

    return ExecResult(stdout=stdout, stderr=result.stderr, code=exit_code, durationMs=result.duration_ms, cwd=end_cwd)


def _collect_searchable_files(root: str, current: str, depth: int, out: list[str]) -> None:
    if depth > 20 or len(out) >= SEARCH_MAX_FILES:
        return
    try:
        entries = list(os.scandir(current))
    except FileNotFoundError:
        return
    for entry in entries:
        if entry.name in SEARCH_SKIP_DIRS:
            continue
        full = os.path.join(current, entry.name)
        if entry.is_dir():
            _collect_searchable_files(root, full, depth + 1, out)
        else:
            out.append(full)
        if len(out) >= SEARCH_MAX_FILES:
            return


def _search(root: str, query: str) -> list[SearchMatch]:
    needle = query.lower()
    files: list[str] = []
    _collect_searchable_files(root, root, 0, files)
    matches: list[SearchMatch] = []
    for file in files:
        if len(matches) >= SEARCH_MAX_MATCHES:
            break
        try:
            if os.path.getsize(file) > SEARCH_MAX_FILE_BYTES:
                continue
            with open(file, "r", encoding="utf-8") as f:
                lines = f.read().split("\n")
        except (OSError, UnicodeDecodeError):
            continue
        for i, line in enumerate(lines):
            if needle in line.lower():
                matches.append(
                    SearchMatch(file=os.path.relpath(file, root), line=i + 1, preview=line.strip()[:200])
                )
                if len(matches) >= SEARCH_MAX_MATCHES:
                    break
    return matches


async def search_workspace(db: AsyncSession, user_id: str, workspace_id: str, query: str) -> list[SearchMatch]:
    ws = await workspace_for(db, user_id, workspace_id)
    trimmed = query.strip()
    if not trimmed:
        raise AppError(400, "EMPTY_QUERY", "Search query is required")
    return await asyncio.to_thread(_search, ws.rootPath, trimmed)


# --- Source control: real git status/diff/commit via the git CLI ---


async def _run_git(cwd: str, args: list[str]) -> str:
    proc = await asyncio.create_subprocess_exec(
        "git", *args, cwd=cwd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    stdout, _ = await proc.communicate()
    return stdout.decode(errors="replace")


async def _ensure_git_repo(root: str) -> None:
    if os.path.isdir(os.path.join(root, ".git")):
        return
    await _run_git(root, ["init"])
    await _run_git(root, ["config", "user.email", "dev@bugfixer.local"])
    await _run_git(root, ["config", "user.name", "BugFixer Dev"])
    await _run_git(root, ["add", "-A"])
    await _run_git(root, ["commit", "-m", "Initial workspace snapshot", "--allow-empty"])


async def git_status(db: AsyncSession, user_id: str, workspace_id: str) -> GitStatusResult:
    ws = await workspace_for(db, user_id, workspace_id)
    await _ensure_git_repo(ws.rootPath)
    branch_out = await _run_git(ws.rootPath, ["rev-parse", "--abbrev-ref", "HEAD"])
    status_out = await _run_git(ws.rootPath, ["status", "--porcelain=v1"])
    entries = [
        GitStatusEntry(status=line[:2].strip(), path=line[3:])
        for line in status_out.split("\n")
        if line
    ]
    return GitStatusResult(branch=branch_out.strip() or "main", entries=entries)


async def git_diff(db: AsyncSession, user_id: str, workspace_id: str, file: str | None) -> str:
    ws = await workspace_for(db, user_id, workspace_id)
    await _ensure_git_repo(ws.rootPath)
    args = ["diff", "--", file] if file else ["diff"]
    return await _run_git(ws.rootPath, args)


async def git_commit(db: AsyncSession, user_id: str, workspace_id: str, message: str) -> dict:
    ws = await workspace_for(db, user_id, workspace_id)
    await _ensure_git_repo(ws.rootPath)
    await _run_git(ws.rootPath, ["add", "-A"])
    trimmed = message.strip() or "Workspace update"
    proc = await asyncio.create_subprocess_exec(
        "git", "commit", "-m", trimmed, cwd=ws.rootPath,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    await proc.communicate()
    return {"committed": proc.returncode == 0}
