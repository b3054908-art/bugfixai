"""add preview command/port fields to Project

Revision ID: b7c9d1e3f5a2
Revises: a1b2c3d4e5f6
Create Date: 2026-09-15

"""

import sqlalchemy as sa
from alembic import op


revision = "b7c9d1e3f5a2"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("Project", sa.Column("previewCommand", sa.String(), nullable=True))
    op.add_column("Project", sa.Column("previewPort", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("Project", "previewPort")
    op.drop_column("Project", "previewCommand")
