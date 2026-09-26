"""
Mirrors: backend/src/modules/copilot/copilot.service.ts

Calls the real app.modules.ai.service.copilot_reply(), which resolves the
provider/model, looks up the user's credential (or the env fallback),
builds workspace-aware context, and returns {"answer": str, "proposal":
dict | None}. The proposal, when present, is stored as a CodeChangeProposal
row linked to the AI's message — the same row the frontend renders as an
Apply/Reject diff card.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.common.errors.app_error import AppError
from app.models.copilot import CodeChangeProposal, CopilotConversation, CopilotMessage
from app.models.enums import ProposalStatus
from app.modules.ai.service import copilot_reply

_MESSAGE_LOAD_OPTS = selectinload(CopilotConversation.messages).selectinload(CopilotMessage.proposal)

_REQUIRED_PROPOSAL_KEYS = {
    "file", "title", "description", "explanation",
    "startLine", "endLine", "originalCode", "proposedCode", "diffSummary",
}


async def create_conversation(db: AsyncSession, user_id: str, project_id: str | None) -> CopilotConversation:
    convo = CopilotConversation(userId=user_id, projectId=project_id)
    db.add(convo)
    await db.commit()
    return await get_conversation(db, user_id, convo.id)


async def get_conversation(db: AsyncSession, user_id: str, conversation_id: str) -> CopilotConversation:
    stmt = (
        select(CopilotConversation)
        .where(CopilotConversation.id == conversation_id, CopilotConversation.userId == user_id)
        .options(_MESSAGE_LOAD_OPTS)
    )
    convo = (await db.execute(stmt)).scalar_one_or_none()
    if convo is None:
        raise AppError(404, "CONVERSATION_NOT_FOUND", "Conversation was not found")
    return convo


async def _conversation_for(db: AsyncSession, user_id: str, conversation_id: str) -> CopilotConversation:
    stmt = select(CopilotConversation).where(
        CopilotConversation.id == conversation_id, CopilotConversation.userId == user_id
    )
    convo = (await db.execute(stmt)).scalar_one_or_none()
    if convo is None:
        raise AppError(404, "CONVERSATION_NOT_FOUND", "Conversation was not found")
    return convo


async def send_message(
    db: AsyncSession,
    user_id: str,
    conversation_id: str,
    text: str,
    provider: str | None,
    model: str | None,
    file_path: str | None = None,
) -> CopilotMessage:
    convo = await _conversation_for(db, user_id, conversation_id)

    user_message = CopilotMessage(conversationId=convo.id, sender="user", text=text)
    db.add(user_message)
    await db.flush()

    # A provider failure (no key configured yet, network error, bad JSON reply, etc.) should
    # never crash the whole request — that would lose the user's message and, worse, is exactly
    # what a brand-new user (before they've added any API key) would hit on their very first
    # message. Save it as a normal AI message explaining what happened instead.
    try:
        reply = await copilot_reply(db, user_id, convo.projectId, text, provider, model, file_path=file_path)
        result = reply.get("result") or {}
        answer_text = str(result.get("answer") or "").strip() or "(No response.)"
        proposal_payload = result.get("proposal")
        used_provider, used_model = reply.get("provider"), reply.get("model")
    except AppError as exc:
        answer_text = f"I couldn't get a response from the AI provider: {exc.message}"
        proposal_payload = None
        used_provider, used_model = provider, model
    except Exception as exc:  # noqa: BLE001 — any other provider/network failure degrades the same way
        answer_text = f"I couldn't get a response from the AI provider: {exc}"
        proposal_payload = None
        used_provider, used_model = provider, model

    ai_message = CopilotMessage(
        conversationId=convo.id,
        sender="ai",
        text=answer_text,
        modelUsed=used_model,
        provider=used_provider,
    )
    db.add(ai_message)
    await db.flush()

    if isinstance(proposal_payload, dict) and _REQUIRED_PROPOSAL_KEYS.issubset(proposal_payload.keys()):
        try:
            proposal = CodeChangeProposal(
                conversationId=convo.id,
                messageId=ai_message.id,
                file=str(proposal_payload["file"]),
                title=str(proposal_payload["title"]),
                description=str(proposal_payload["description"]),
                explanation=str(proposal_payload["explanation"]),
                startLine=int(proposal_payload["startLine"]),
                endLine=int(proposal_payload["endLine"]),
                originalCode=str(proposal_payload["originalCode"]),
                proposedCode=str(proposal_payload["proposedCode"]),
                diffSummary=str(proposal_payload["diffSummary"]),
                status=ProposalStatus.PENDING_PERMISSION,
            )
            db.add(proposal)
        except (KeyError, ValueError, TypeError):
            pass  # malformed proposal payload — still keep the plain-text answer

    await db.commit()
    return await _message_with_proposal(db, ai_message.id)


async def _message_with_proposal(db: AsyncSession, message_id: str) -> CopilotMessage:
    stmt = (
        select(CopilotMessage)
        .where(CopilotMessage.id == message_id)
        .options(selectinload(CopilotMessage.proposal))
    )
    return (await db.execute(stmt)).scalar_one()


async def set_proposal_status(db: AsyncSession, user_id: str, proposal_id: str, status: str) -> CodeChangeProposal:
    try:
        status_enum = ProposalStatus(status)
    except ValueError:
        raise AppError(400, "INVALID_STATUS", f"Unknown proposal status: {status}")

    stmt = (
        select(CodeChangeProposal)
        .join(CopilotConversation, CodeChangeProposal.conversationId == CopilotConversation.id)
        .where(CodeChangeProposal.id == proposal_id, CopilotConversation.userId == user_id)
    )
    proposal = (await db.execute(stmt)).scalar_one_or_none()
    if proposal is None:
        raise AppError(404, "PROPOSAL_NOT_FOUND", "Proposal was not found")

    proposal.status = status_enum
    await db.commit()
    await db.refresh(proposal)
    return proposal