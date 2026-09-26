"""Mirrors: backend/src/common/utils/ids.ts (new)

Every model's primary key is a Postgres UUID column. Passing a non-UUID string
straight into a `WHERE id = :value` comparison makes asyncpg raise a raw
DataError, which the global exception handler turns into an opaque 500
instead of a clean 400. Routes/services that take an id from the client
(path or query param) should validate it with `ensure_valid_id` first.
"""
from uuid import UUID

from app.common.errors.app_error import AppError


def ensure_valid_id(value: str, *, field: str = "id") -> str:
    """Raises a clean 400 AppError if `value` isn't a well-formed UUID, otherwise returns it unchanged."""
    try:
        UUID(value)
    except (ValueError, AttributeError, TypeError):
        raise AppError(400, "INVALID_ID", f"'{field}' must be a valid id") from None
    return value
