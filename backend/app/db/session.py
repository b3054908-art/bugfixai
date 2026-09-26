"""
Database engine + session.
Mirrors: backend/src/config/database.ts (PrismaClient -> async SQLAlchemy engine)
"""
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.NODE_ENV == "development",
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: yields a request-scoped async DB session."""
    async with AsyncSessionLocal() as session:
        yield session


async def connect_database() -> None:
    try:
        async with engine.connect():
            pass
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"Database connection failed: {exc}") from exc


async def disconnect_database() -> None:
    try:
        await engine.dispose()
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"Database disconnect failed: {exc}") from exc
