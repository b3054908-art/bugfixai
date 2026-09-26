"""Mirrors: backend/src/modules/fixes/validation.service.ts"""
import asyncio
import time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.fix import FixProposal, FixValidation
from app.models.enums import ValidationStatus


async def _run(command: str, cwd: str, timeout_ms: int) -> dict:
    proc = await asyncio.create_subprocess_shell(
        command,
        cwd=cwd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env={"CI": "true"},
    )
    try:
        stdout_b, stderr_b = await asyncio.wait_for(proc.communicate(), timeout=timeout_ms / 1000)
        code = proc.returncode if proc.returncode is not None else 1
        return {"stdout": stdout_b.decode(errors="replace"), "stderr": stderr_b.decode(errors="replace"), "code": code}
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        return {"stdout": "", "stderr": "Process timed out", "code": 124}


async def validate_workspace(
    db: AsyncSession, project_id: str, fix_id: str, workspace_path: str, command: str
) -> dict:
    started = time.time()
    result = await _run(command, workspace_path, settings.SANDBOX_TIMEOUT_MS)
    duration_ms = int((time.time() - started) * 1000)
    passed = 1 if result["code"] == 0 else 0
    failed = 0 if result["code"] == 0 else 1
    status = ValidationStatus.PASSED if result["code"] == 0 else ValidationStatus.FAILED

    validation = FixValidation(
        fixId=fix_id,
        status=status,
        testPassRate="100%" if result["code"] == 0 else "0%",
        totalTests=1,
        passedTests=passed,
        failedTests=failed,
        regressionFound=False,
        recommendation="Apply the validated patch." if result["code"] == 0 else "Keep the patch unapplied and re-analyze the failure.",
        summary=f"Validation command completed with exit code {result['code']} in {duration_ms}ms.",
        cycleCount=1,
    )
    db.add(validation)

    fix = (await db.execute(select(FixProposal).where(FixProposal.id == fix_id))).scalar_one()
    fix.validationStatus = status
    await db.commit()
    await db.refresh(validation)

    return {"validation": validation, "stdout": result["stdout"], "stderr": result["stderr"]}
