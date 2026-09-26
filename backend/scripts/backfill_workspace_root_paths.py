"""
One-off fix for projects created before the Workspace.rootPath bug was fixed.

Those rows have rootPath == "" (see app/modules/projects/service.py), which
made the Explorer always look empty and made file "saves" silently write into
the backend process's current working directory instead of the project.

This assigns each of them a real directory under SANDBOX_WORK_ROOT and
creates it on disk. Existing rows with a non-empty rootPath are left alone.

Run from backend/:
    python -m scripts.backfill_workspace_root_paths
"""
import asyncio
import os

from sqlalchemy import select

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.models.context import Workspace


async def main() -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Workspace).where(Workspace.rootPath == ""))
        broken = result.scalars().all()

        if not broken:
            print("No broken workspaces found (rootPath already set for all).")
            return

        for ws in broken:
            root_path = os.path.abspath(os.path.join(settings.SANDBOX_WORK_ROOT, ws.projectId))
            os.makedirs(root_path, exist_ok=True)
            ws.rootPath = root_path
            print(f"workspace {ws.id} (project {ws.projectId}) -> {root_path}")

        await db.commit()
        print(f"Fixed {len(broken)} workspace(s).")


if __name__ == "__main__":
    asyncio.run(main())