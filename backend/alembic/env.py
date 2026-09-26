import asyncio
from logging.config import fileConfig

from alembic import context as alembic_context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.core.config import settings as app_settings
from app.db.base import Base
from app.models import *  # noqa: F401,F403  (registers all models on Base.metadata)

config = alembic_context.config
config.set_main_option("sqlalchemy.url", app_settings.DATABASE_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    alembic_context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with alembic_context.begin_transaction():
        alembic_context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    alembic_context.configure(connection=connection, target_metadata=target_metadata)
    with alembic_context.begin_transaction():
        alembic_context.run_migrations()


async def run_migrations_online() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if alembic_context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
