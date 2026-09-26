"""Mirrors: backend/src/modules/copilot/{copilot.routes,copilot.controller}.ts"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.middleware.auth import AuthUser, require_auth
from app.db.session import get_db
from app.modules.copilot.schemas import (
    ConversationOut,
    CreateConversationRequest,
    MessageOut,
    ProposalOut,
    SendMessageRequest,
    SetProposalStatusRequest,
)
from app.modules.copilot.service import create_conversation, get_conversation, send_message, set_proposal_status

router = APIRouter(prefix="/copilot", tags=["copilot"])


@router.post("/conversations", response_model=ConversationOut, status_code=201)
async def post_conversation(
    payload: CreateConversationRequest,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    convo = await create_conversation(db, current_user.id, payload.projectId)
    return ConversationOut.model_validate(convo)


@router.get("/conversations/{conversation_id}", response_model=ConversationOut)
async def get_conversation_(
    conversation_id: str,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    convo = await get_conversation(db, current_user.id, conversation_id)
    return ConversationOut.model_validate(convo)


@router.post("/conversations/{conversation_id}/messages", response_model=MessageOut, status_code=201)
async def post_message(
    conversation_id: str,
    payload: SendMessageRequest,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    message = await send_message(
        db, current_user.id, conversation_id, payload.text, payload.provider, payload.model, file_path=payload.filePath
    )
    return MessageOut.model_validate(message)


@router.post("/proposals/{proposal_id}/status", response_model=ProposalOut)
async def post_proposal_status(
    proposal_id: str,
    payload: SetProposalStatusRequest,
    current_user: AuthUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    proposal = await set_proposal_status(db, current_user.id, proposal_id, payload.status)
    return ProposalOut.model_validate(proposal)