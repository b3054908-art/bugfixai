"""
Mirrors: backend/src/common/websocket/{realtime.gateway,events}.ts

Publishes pipeline events to a per-project Redis channel. The Celery worker
(a separate process from the FastAPI web server) calls `publish()`; the
`/realtime` websocket endpoint (see app/modules/realtime/router.py, running
in the FastAPI process) subscribes to the same channel and relays messages
to connected browser clients. Redis is the bridge between the two processes.
"""
import json

import structlog

from app.core.redis_client import get_redis_client

logger = structlog.get_logger(__name__)


REALTIME_EVENTS = {
    "phase_started": "phase.started",
    "phase_progress": "phase.progress",
    "log_created": "log.created",
    "subprocess_updated": "phase.subprocess",
    "security_updated": "phase.security",
    "validation_updated": "phase.validation",
}


def channel_for_project(project_id: str) -> str:
    return f"realtime:project:{project_id}"


class RealtimeGateway:
    async def publish(self, project_id: str, message: dict) -> None:
        client = get_redis_client()
        try:
            await client.publish(channel_for_project(project_id), json.dumps(message))
        except Exception as exc:  # noqa: BLE001
            # A dead realtime stream should never take down the pipeline itself —
            # log and move on so phase execution keeps working even if Redis hiccups.
            logger.warning(
                "realtime_publish_failed",
                project_id=project_id,
                message_type=message.get("type"),
                error=str(exc),
            )