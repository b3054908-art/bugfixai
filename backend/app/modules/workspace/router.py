"""Mirrors: backend/src/modules/workspace/workspace.routes.ts + workspace.controller.ts"""
import asyncio
import json
import os
import pty
import signal
import struct
import subprocess
import termios
import fcntl

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.errors.app_error import AppError
from app.common.middleware.auth import AuthUser, _get_or_create_dev_user, require_auth
from app.core.config import settings
from app.core.security import decode_access_token
from app.db.session import AsyncSessionLocal, get_db
from app.modules.workspace.schemas import (
    CreateFolderRequest,
    CreateFolderResponse,
    DeleteResponse,
    ExecRequest,
    ExecResult,
    FileContent,
    GitCommitRequest,
    GitCommitResponse,
    GitDiffResponse,
    GitStatusResult,
    RenameRequest,
    RenameResponse,
    SearchMatch,
    TreeNode,
    WriteFileRequest,
    WriteFileResponse,
)
from app.modules.workspace.service import (
    create_folder,
    delete_path,
    exec_command,
    git_commit,
    git_diff,
    git_status,
    read_file,
    rename_path,
    search_workspace,
    tree,
    workspace_for,
    write_file,
)

router = APIRouter(prefix="/workspaces", tags=["workspace"])


class WorkspaceTerminalSession:
    def __init__(self, root_path: str):
        self.root_path = root_path
        self.master_fd: int | None = None
        self.process: subprocess.Popen[bytes] | None = None
        self.closed = False
        self._start()

    def _start(self) -> None:
        master_fd, slave_fd = pty.openpty()
        env = os.environ.copy()
        env.setdefault("TERM", "xterm-256color")
        self.process = subprocess.Popen(
            ["/bin/bash", "--noprofile", "--norc", "-i"],
            stdin=slave_fd,
            stdout=slave_fd,
            stderr=slave_fd,
            cwd=self.root_path,
            env=env,
            start_new_session=True,
            close_fds=True,
        )
        os.close(slave_fd)
        self.master_fd = master_fd
        os.set_blocking(master_fd, False)

    def write(self, data: str) -> None:
        if self.closed or self.master_fd is None:
            return
        try:
            os.write(self.master_fd, data.encode("utf-8"))
        except OSError:
            self.close()

    def resize(self, rows: int, cols: int) -> None:
        if self.closed or self.master_fd is None:
            return
        rows = max(1, int(rows))
        cols = max(1, int(cols))
        try:
            fcntl.ioctl(self.master_fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
        except OSError:
            pass

    def close(self) -> None:
        if self.closed:
            return
        self.closed = True
        if self.process is not None and self.process.poll() is None:
            try:
                self.process.send_signal(signal.SIGTERM)
            except ProcessLookupError:
                pass
        if self.master_fd is not None:
            try:
                os.close(self.master_fd)
            except OSError:
                pass
            self.master_fd = None


TERMINAL_SESSIONS: dict[str, WorkspaceTerminalSession] = {}


@router.websocket("/{workspace_id}/terminal")
async def workspace_terminal_socket(workspace_id: str, websocket: WebSocket) -> None:
    token = websocket.query_params.get("token")

    if not settings.DEV_SKIP_AUTH:
        if not token:
            await websocket.close(code=4400, reason="token is required")
            return
        try:
            claims = decode_access_token(token)
            user_id = claims.get("sub") or claims.get("user_id")
            if not user_id:
                raise ValueError("missing subject")
        except ValueError:
            await websocket.close(code=4401, reason="Invalid or expired token")
            return
    else:
        async with AsyncSessionLocal() as db:
            user = await _get_or_create_dev_user(db)
            user_id = str(user.id)

    async with AsyncSessionLocal() as db:
        try:
            workspace = await workspace_for(db, user_id, workspace_id)
        except AppError:
            await websocket.close(code=4404, reason="Workspace not found")
            return

    await websocket.accept()
    try:
        session = WorkspaceTerminalSession(workspace.rootPath)
    except (FileNotFoundError, OSError, ValueError):
        await websocket.close(code=1011, reason="Failed to initialize terminal workspace")
        return
    TERMINAL_SESSIONS[workspace_id] = session

    async def read_loop() -> None:
        while not session.closed and session.master_fd is not None:
            try:
                await asyncio.sleep(0.05)
                chunk = os.read(session.master_fd, 4096)
            except BlockingIOError:
                continue
            except OSError:
                break
            if not chunk:
                break
            try:
                await websocket.send_text(json.dumps({"type": "output", "data": chunk.decode("utf-8", errors="replace")}))
            except WebSocketDisconnect:
                break

    read_task = asyncio.create_task(read_loop())
    try:
        while True:
            raw_message = await websocket.receive_text()
            payload = json.loads(raw_message)
            kind = payload.get("type")
            if kind == "resize":
                session.resize(int(payload.get("rows", 30)), int(payload.get("cols", 120)))
            elif kind == "input":
                session.write(str(payload.get("data", "")))
    except WebSocketDisconnect:
        pass
    except json.JSONDecodeError:
        pass
    finally:
        read_task.cancel()
        session.close()
        TERMINAL_SESSIONS.pop(workspace_id, None)


@router.get("/{workspace_id}/tree", response_model=list[TreeNode])
async def get_tree(
    workspace_id: str,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    return await tree(db, current_user.id, workspace_id)


@router.get("/{workspace_id}/file", response_model=FileContent)
async def get_file(
    workspace_id: str,
    path: str = Query(min_length=1),
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    result = await read_file(db, current_user.id, workspace_id, path)
    return FileContent(**result)


@router.put("/{workspace_id}/file", response_model=WriteFileResponse)
async def put_file(
    workspace_id: str,
    payload: WriteFileRequest,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    result = await write_file(db, current_user.id, workspace_id, payload.path, payload.content)
    return WriteFileResponse(**result)


@router.delete("/{workspace_id}/path", response_model=DeleteResponse)
async def delete_workspace_path(
    workspace_id: str,
    path: str = Query(min_length=1),
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    result = await delete_path(db, current_user.id, workspace_id, path)
    return DeleteResponse(**result)


@router.post("/{workspace_id}/rename", response_model=RenameResponse)
async def post_rename(
    workspace_id: str,
    payload: RenameRequest,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    result = await rename_path(db, current_user.id, workspace_id, payload.oldPath, payload.newPath)
    return RenameResponse(**result)


@router.post("/{workspace_id}/folder", response_model=CreateFolderResponse)
async def post_folder(
    workspace_id: str,
    payload: CreateFolderRequest,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    result = await create_folder(db, current_user.id, workspace_id, payload.path)
    return CreateFolderResponse(**result)


@router.post("/{workspace_id}/exec", response_model=ExecResult)
async def post_exec(
    workspace_id: str,
    payload: ExecRequest,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    return await exec_command(db, current_user.id, workspace_id, payload.command, payload.cwd)


@router.get("/{workspace_id}/search", response_model=list[SearchMatch])
async def get_search(
    workspace_id: str,
    q: str = Query(min_length=1),
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    return await search_workspace(db, current_user.id, workspace_id, q)


@router.get("/{workspace_id}/git/status", response_model=GitStatusResult)
async def get_git_status(
    workspace_id: str,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    return await git_status(db, current_user.id, workspace_id)


@router.get("/{workspace_id}/git/diff", response_model=GitDiffResponse)
async def get_git_diff(
    workspace_id: str,
    path: str | None = Query(default=None, min_length=1),
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    diff = await git_diff(db, current_user.id, workspace_id, path)
    return GitDiffResponse(diff=diff)


@router.post("/{workspace_id}/git/commit", response_model=GitCommitResponse)
async def post_git_commit(
    workspace_id: str,
    payload: GitCommitRequest,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    result = await git_commit(db, current_user.id, workspace_id, payload.message)
    return GitCommitResponse(**result)
