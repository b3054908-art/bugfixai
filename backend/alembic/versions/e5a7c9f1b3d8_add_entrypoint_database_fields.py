"""add entryPoint and databaseType fields to Project

Revision ID: e5a7c9f1b3d8
Revises: d4f8a2c6b9e1
Create Date: 2026-09-22

"""

import sqlalchemy as sa
from alembic import op


revision = "e5a7c9f1b3d8"
down_revision = "d4f8a2c6b9e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("Project", sa.Column("entryPoint", sa.String(), nullable=True))
    op.add_column("Project", sa.Column("databaseType", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("Project", "databaseType")
    op.drop_column("Project", "entryPoint")
