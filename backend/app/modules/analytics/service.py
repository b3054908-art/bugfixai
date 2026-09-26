from collections import Counter
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.common.errors.app_error import AppError
from app.models.bug import Bug
from app.models.enums import BugStatus, FixStatus
from app.models.fix import FixProposal, TestRun
from app.models.project import Project


async def get_project_analytics(db: AsyncSession, user_id: str, project_id: str) -> dict:
    project = (
        await db.execute(select(Project).where(Project.id == project_id, Project.ownerId == user_id))
    ).scalar_one_or_none()
    if project is None:
        raise AppError(404, "PROJECT_NOT_FOUND", "Project was not found")

    bugs = list((await db.execute(select(Bug).where(Bug.projectId == project_id))).scalars().all())
    fixes = list(
        (
            await db.execute(
                select(FixProposal)
                .where(FixProposal.projectId == project_id)
                .options(selectinload(FixProposal.validations))
            )
        )
        .scalars()
        .all()
    )
    tests = list((await db.execute(select(TestRun).where(TestRun.projectId == project_id))).scalars().all())

    resolved = [bug for bug in bugs if bug.status in (BugStatus.Fixed, BugStatus.Closed)]
    resolution_minutes = [
        max(0, int((bug.updatedAt - bug.loggedDate).total_seconds() / 60))
        for bug in resolved
        if bug.updatedAt and bug.loggedDate
    ]
    mttr_minutes = round(sum(resolution_minutes) / len(resolution_minutes)) if resolution_minutes else 0

    total_tests = sum(test.total for test in tests)
    passed_tests = sum(test.passed for test in tests)
    test_pass_rate = round((passed_tests / total_tests) * 100) if total_tests else 0

    root_causes = Counter(
        (bug.tags[0] if bug.tags else "Uncategorized")
        for bug in bugs
    )
    timeline = {
        "bugs": [
            {"date": bug.loggedDate.date().isoformat(), "status": bug.status.value}
            for bug in sorted(bugs, key=lambda item: item.loggedDate)
        ],
        "fixes": [
            {"date": fix.createdAt.date().isoformat(), "status": fix.status.value, "confidence": fix.confidence}
            for fix in sorted(fixes, key=lambda item: item.createdAt)
        ],
    }

    return {
        "mttrMinutes": mttr_minutes,
        "aiRepairedBugs": sum(1 for fix in fixes if fix.status == FixStatus.Applied),
        "testPassRate": test_pass_rate,
        "bugsDetected": len(bugs),
        "fixesGenerated": len(fixes),
        "testRunCount": len(tests),
        "aiComputeCost": None,
        "costTracked": False,
        "rootCauses": dict(root_causes),
        "mttrTrend": [],
        "timeline": timeline,
    }


async def clear_project_tests(db: AsyncSession, user_id: str, project_id: str) -> int:
    """Deletes TestRun records for a project — the one piece of analytics
    data (test pass rate) that isn't already owned by the Bug or Fix
    History cards. Bug/fix-derived metrics (MTTR, bugs detected, fixes
    generated) are cleared by those cards instead, since they come
    straight from the Bug/FixProposal tables."""
    project = (
        await db.execute(select(Project).where(Project.id == project_id, Project.ownerId == user_id))
    ).scalar_one_or_none()
    if project is None:
        raise AppError(404, "PROJECT_NOT_FOUND", "Project was not found")

    count = (
        await db.execute(select(func.count()).select_from(TestRun).where(TestRun.projectId == project_id))
    ).scalar_one()
    await db.execute(delete(TestRun).where(TestRun.projectId == project_id))
    await db.commit()
    return count