"""Shared async Redis client, used for pub/sub between the Celery worker
process (which runs the pipeline) and the FastAPI process (which holds the
live websocket connections). A single connection is reused per process.
"""
import redis.asyncio as redis

from app.core.config import settings

_client: redis.Redis | None = None


def get_redis_client() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _client