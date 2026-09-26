"""
Mirrors: backend/src/common/websocket/realtime.gateway.ts (server side)

This is the piece that was missing entirely (see the "lands in Phase 5"
comment that used to be in main.py). A browser connects here with a JWT and
a projectId; this subscribes to that project's Redis channel and relays
whatever RealtimeGateway.publish() sends (from the Celery worker process)
straight through to the browser as-is.
"""
import asyncio

import structlog
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.common.websocket.realtime_gateway import channel_for_project
from app.core.config import settings
from app.core.redis_client import get_redis_client
from app.core.security import decode_access_token

router = APIRouter()
logger = structlog.get_logger(__name__)


@router.websocket("/realtime")
async def realtime_endpoint(websocket: WebSocket) -> None:
    token = websocket.query_params.get("token")
    project_id = websocket.query_params.get("projectId")

    if not project_id:
        await websocket.close(code=4400, reason="projectId is required")
        return

    if not settings.DEV_SKIP_AUTH:
        if not token:
            await websocket.close(code=4400, reason="token is required")
            return
        try:
            decode_access_token(token)
        except ValueError:
            await websocket.close(code=4401, reason="Invalid or expired token")
            return

    await websocket.accept()

    client = get_redis_client()
    pubsub = client.pubsub()
    channel = channel_for_project(project_id)
    await pubsub.subscribe(channel)
    logger.info("realtime_client_connected", project_id=project_id)

    async def relay_from_redis() -> None:
        async for message in pubsub.listen():
            if message.get("type") != "message":
                continue
            await websocket.send_text(message["data"])

    async def watch_for_disconnect() -> None:
        try:
            while True:
                # Clients don't need to send anything; this just detects close.
                await websocket.receive_text()
        except WebSocketDisconnect:
            pass

    relay_task = asyncio.create_task(relay_from_redis())
    watch_task = asyncio.create_task(watch_for_disconnect())

    try:
        _done, pending = await asyncio.wait(
            {relay_task, watch_task}, return_when=asyncio.FIRST_COMPLETED
        )
        for task in pending:
            task.cancel()
    except Exception as exc:  # noqa: BLE001
        logger.warning("realtime_connection_error", project_id=project_id, error=str(exc))
    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.close()
        logger.info("realtime_client_disconnected", project_id=project_id)