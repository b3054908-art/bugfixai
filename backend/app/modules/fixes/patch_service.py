"""Mirrors: backend/src/modules/fixes/{diff.service,patch.service}.ts"""
import os

import aiofiles

from app.common.utils.safe_path import resolve_safe_path


def count_changed_lines(diff: str) -> int:
    count = 0
    for line in diff.split("\n"):
        if (line.startswith("+") and not line.startswith("+++")) or (
            line.startswith("-") and not line.startswith("---")
        ):
            count += 1
    return count


def count_added_removed_lines(diff: str) -> tuple[int, int]:
    """Same walk as count_changed_lines but split by direction -- feeds
    FixAttempt.linesAdded/linesRemoved (Job 4)."""
    added = removed = 0
    for line in diff.split("\n"):
        if line.startswith("+") and not line.startswith("+++"):
            added += 1
        elif line.startswith("-") and not line.startswith("---"):
            removed += 1
    return added, removed


async def read_workspace_file(root: str, file: str) -> str:
    target = resolve_safe_path(root, file)
    async with aiofiles.open(target, "r", encoding="utf-8") as f:
        return await f.read()


async def write_workspace_file(root: str, file: str, content: str) -> str:
    target = resolve_safe_path(root, file)
    os.makedirs(os.path.dirname(target), exist_ok=True)
    async with aiofiles.open(target, "w", encoding="utf-8") as f:
        await f.write(content)
    return target


def apply_simple_replacement(original: str, old_text: str, new_text: str) -> str:
    if old_text not in original:
        raise ValueError("Original code context was not found")
    return original.replace(old_text, new_text, 1)