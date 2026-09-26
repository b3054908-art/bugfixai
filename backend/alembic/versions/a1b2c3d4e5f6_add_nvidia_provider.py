"""add NVIDIA as an AI provider

Revision ID: a1b2c3d4e5f6
Revises: c28151f088bb
Create Date: 2026-09-08

"""

from alembic import op


revision = "a1b2c3d4e5f6"
down_revision = "c28151f088bb"
branch_labels = None
depends_on = None


def upgrade() -> None:
	op.execute("ALTER TYPE provider ADD VALUE IF NOT EXISTS 'nvidia'")


def downgrade() -> None:
	# PostgreSQL does not support removing an enum value in place.
	pass
