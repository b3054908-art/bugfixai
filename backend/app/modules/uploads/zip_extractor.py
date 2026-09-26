"""Mirrors: backend/src/modules/uploads/zip-extractor.ts"""
import asyncio
import os
import shutil

from app.modules.uploads.archive_validator import validate_archive


async def _run(program: str, args: list[str]) -> None:
    proc = await asyncio.create_subprocess_exec(
        program, *args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"{program} failed: {stderr.decode(errors='replace')}")


async def extract_archive(archive: str, target: str) -> str:
    os.makedirs(target, exist_ok=True)
    archive_type = await validate_archive(archive)

    if archive_type == "zip":
        await _run("unzip", ["-q", archive, "-d", target])
    else:
        await _run("tar", ["-xzf", archive, "-C", target])

    # Flatten a single top-level wrapper directory (common with GitHub-style zips).
    entries = os.listdir(target)
    if len(entries) == 1:
        only_entry = os.path.join(target, entries[0])
        if os.path.isdir(only_entry):
            for name in os.listdir(only_entry):
                shutil.move(os.path.join(only_entry, name), os.path.join(target, name))
            shutil.rmtree(only_entry)

    return target
