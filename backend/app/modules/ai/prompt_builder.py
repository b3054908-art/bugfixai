"""Mirrors: backend/src/modules/ai/prompt-builder.ts"""


def build_diagnosis_prompt(context: str) -> str:
    """LEGACY: single combined diagnosis+patch prompt. No longer called by
    diagnose_bug/generate_fix (see build_root_cause_prompt / build_patch_prompt,
    Job 4's split into two real AI calls) but left in place in case anything
    external still imports it directly."""
    return (
        "You are a senior debugging engineer. Analyze the supplied project context. "
        "Respond with ONLY a single valid JSON object — no markdown fences, no reasoning "
        "text, no commentary before or after it. Escape every double quote, backslash, and "
        "newline that appears inside string values so the JSON stays valid. "
        "Return valid JSON with keys rootCause, explanation, confidence, patchSummary, "
        "affectedFiles, estimatedMinutes, originalCode, proposedCode, unifiedDiff. "
        "Do not claim tests passed unless test evidence is provided.\n\n"
        f"CONTEXT:\n{context}"
    )


def build_root_cause_prompt(context: str) -> str:
    """Phase 5 (AI Root Cause Analysis): diagnosis ONLY, no patch. Deliberately
    withholds any request for code changes so the model can't shortcut straight
    to "here's a fix" without first committing to an explicit root cause and
    blast radius -- which Phase 6 then has to honor."""
    return (
        "You are a senior debugging engineer performing root-cause analysis. "
        "Do NOT propose a code fix in this step -- diagnosis only. "
        "If CONTEXT.project.database is present, this project expects that "
        "database to be reachable. When database.sidecarSupported is false, "
        "no database was provisioned in the sandbox at all this run -- treat "
        "any connection-refused, connection-timeout, or similar connectivity "
        "error as an environment gap, not an application bug, and reflect "
        "that in rootCause/explanation rather than proposing to patch code "
        "that was never actually broken. When sidecarSupported is true, a "
        "matching database container was attempted for this run, so only "
        "apply that same caution if the error message itself still looks "
        "like a raw connection failure rather than a query/logic error. "
        "Respond with ONLY a single valid JSON object — no markdown fences, no reasoning "
        "text, no commentary before or after it. Escape every double quote, backslash, and "
        "newline that appears inside string values so the JSON stays valid. "
        "Return valid JSON with keys rootCause, explanation, confidence, affectedFiles, "
        "blastRadius (a short note on what else the bug could impact). "
        "Do not claim tests passed unless test evidence is provided.\n\n"
        f"CONTEXT:\n{context}"
    )


def build_patch_prompt(context: str, diagnosis: dict) -> str:
    """Phase 6 (AI Patch Generation): patch synthesis ONLY, grounded in the
    root cause Phase 5 already committed to (passed in verbatim, not
    re-derived) so the patch can't silently diverge from the diagnosis it's
    supposed to be fixing."""
    diagnosis_block = (
        f"rootCause: {diagnosis.get('rootCause', '')}\n"
        f"explanation: {diagnosis.get('explanation', '')}\n"
        f"affectedFiles: {diagnosis.get('affectedFiles', [])}\n"
        f"blastRadius: {diagnosis.get('blastRadius', '')}"
    )
    return (
        "You are a senior debugging engineer writing a minimal patch for an "
        "already-diagnosed bug. The root cause below is settled -- do not "
        "re-diagnose it, just fix it. "
        "Respond with ONLY a single valid JSON object — no markdown fences, no reasoning "
        "text, no commentary before or after it. Escape every double quote, backslash, and "
        "newline that appears inside string values so the JSON stays valid. "
        "Return valid JSON with keys patchSummary, estimatedMinutes, originalCode, "
        "proposedCode, unifiedDiff.\n\n"
        f"CONFIRMED DIAGNOSIS:\n{diagnosis_block}\n\n"
        f"CONTEXT:\n{context}"
    )


def build_copilot_prompt(context: str, user_message: str) -> str:
    return (
        "You are a repository-aware coding copilot. Answer the user and propose changes "
        "only when evidence in the context supports them. "
        "Respond with ONLY a single valid JSON object — no markdown fences, no reasoning "
        "text, no commentary before or after it. Escape every double quote, backslash, and "
        "newline that appears inside string values so the JSON stays valid. "
        "Return JSON with keys answer, proposal. Proposal must be null or contain "
        "file,title,description,explanation,startLine,endLine,originalCode,proposedCode,diffSummary.\n\n"
        f"PROJECT CONTEXT:\n{context}\n\nUSER:\n{user_message}"
    )
