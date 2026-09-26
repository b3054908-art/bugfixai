"""
A JSON column type that renders as JSONB on PostgreSQL (production/Prisma-parity)
but falls back to plain JSON on other dialects (e.g. SQLite in tests).
"""
from sqlalchemy import JSON, String
from sqlalchemy.dialects.postgresql import ARRAY, JSONB

PortableJSON = JSON().with_variant(JSONB(), "postgresql")

# Postgres native string arrays (used for `tags`, `affectedFiles`), falling back
# to JSON-encoded lists on dialects without native array support (e.g. SQLite tests).
PortableStringArray = ARRAY(String).with_variant(JSON(), "sqlite")
