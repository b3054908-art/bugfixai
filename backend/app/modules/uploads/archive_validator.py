"""Mirrors: backend/src/modules/uploads/archive-validator.ts"""
import asyncio
import os

from app.common.errors.app_error import AppError

MAX_ENTRIES = 100_000


async def _run(program: str, args: list[str]) -> tuple[int, str, str]:
    proc = await asyncio.create_subprocess_exec(
        program, *args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await proc.communicate()
    return proc.returncode or 0, stdout.decode(errors="replace"), stderr.decode(errors="replace")


async def validate_archive(archive: str) -> str:
    ext = os.path.splitext(archive)[1].lower()

    if ext == ".zip":
        code, stdout, _ = await _run("unzip", ["-Z1", archive])
        if code != 0:
            raise AppError(400, "INVALID_ARCHIVE", "ZIP archive could not be read")
        entries = [e for e in stdout.splitlines() if e]
        if len(entries) > MAX_ENTRIES:
            raise AppError(413, "ARCHIVE_TOO_LARGE", "Archive contains too many entries")
        for entry in entries:
            normalized = entry.replace("\\", "/")
            if normalized.startswith("/") or "../" in normalized or normalized == "..":
                raise AppError(400, "UNSAFE_ARCHIVE", "Archive contains an unsafe path")
        return "zip"

    if ext in (".tar", ".gz", ".tgz"):
        code, stdout, _ = await _run("tar", ["-tzf", archive])
        if code != 0:
            raise AppError(400, "INVALID_ARCHIVE", "Archive could not be read")
        entries = [e for e in stdout.splitlines() if e]
        if len(entries) > MAX_ENTRIES:
            raise AppError(413, "ARCHIVE_TOO_LARGE", "Archive contains too many entries")
        if any(e.startswith("/") or "../" in e for e in entries):
            raise AppError(400, "UNSAFE_ARCHIVE", "Archive contains an unsafe path")
        return "tar"

    raise AppError(400, "UNSUPPORTED_ARCHIVE", "Only ZIP, TAR, GZ, and TGZ archives are supported")
