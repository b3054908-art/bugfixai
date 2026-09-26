"""Mirrors: backend/src/common/utils/safe-path.ts"""
import os

from app.common.errors.app_error import AppError


def resolve_safe_path(root: str, target: str) -> str:
    resolved_root = os.path.abspath(root)
    resolved_target = os.path.abspath(os.path.join(root, target))
    if resolved_target != resolved_root and not resolved_target.startswith(resolved_root + os.sep):
        raise AppError(400, "INVALID_PATH", "Path escapes the allowed root")
    return resolved_target
