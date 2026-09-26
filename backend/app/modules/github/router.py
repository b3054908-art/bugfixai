from __future__ import annotations

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel

from app.common.middleware.auth import AuthUser, require_auth

router = APIRouter(prefix="/github", tags=["github"])

_GITHUB_TOKEN: str | None = None
_GITHUB_REPO: dict[str, str] | None = None


class GithubTokenRequest(BaseModel):
    token: str | None = None


class GithubConnectRequest(BaseModel):
    projectId: str | None = None
    owner: str | None = None
    repo: str | None = None
    branch: str | None = None


@router.get("/token/status")
async def get_token_status(
    current_user: AuthUser = Depends(require_auth),
):
    return {"connected": _GITHUB_TOKEN is not None}


@router.post("/token")
async def save_token(
    payload: GithubTokenRequest,
    x_github_token: str | None = Header(default=None, alias="x-github-token"),
    current_user: AuthUser = Depends(require_auth),
):
    token_value = payload.token or x_github_token
    global _GITHUB_TOKEN
    _GITHUB_TOKEN = token_value or _GITHUB_TOKEN
    return {"success": True, "connected": _GITHUB_TOKEN is not None}


@router.post("/connect")
async def connect_repo(
    payload: GithubConnectRequest,
    token: str | None = Header(default=None, alias="x-github-token"),
    current_user: AuthUser = Depends(require_auth),
):
    repo_owner = payload.owner or ""
    repo_name = payload.repo or ""
    branch_name = payload.branch or "main"

    if not repo_owner or not repo_name:
        return {"id": "", "repositoryUrl": "", "defaultBranch": branch_name, "connected": False}

    global _GITHUB_REPO
    _GITHUB_REPO = {
        "owner": repo_owner,
        "repo": repo_name,
        "branch": branch_name,
        "token": token or _GITHUB_TOKEN or "",
    }

    return {
        "id": f"github-{payload.projectId or 'repo'}",
        "repositoryUrl": f"https://github.com/{repo_owner}/{repo_name}",
        "defaultBranch": branch_name,
        "connected": True,
    }
