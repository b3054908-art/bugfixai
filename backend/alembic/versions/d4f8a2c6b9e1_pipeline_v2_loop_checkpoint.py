"""pipeline v2: FixAttempt/PreviewCheckpoint tables, loop-capable AnalysisStatus

Revision ID: d4f8a2c6b9e1
Revises: b7c9d1e3f5a2
Create Date: 2026-09-17

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "d4f8a2c6b9e1"
down_revision = "b7c9d1e3f5a2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # AnalysisRun gets two new terminal/paused states used by the 10-phase
    # loop: AWAITING_REVIEW (paused at the Phase 8 preview checkpoint) and
    # NEEDS_HUMAN_REVIEW (Phase 10 loop exhausted its attempt cap).
    # Postgres requires ADD VALUE outside of use in the same transaction,
    # which is satisfied here since nothing in this migration writes rows
    # using the new values.
    op.execute("ALTER TYPE analysisstatus ADD VALUE IF NOT EXISTS 'AWAITING_REVIEW'")
    op.execute("ALTER TYPE analysisstatus ADD VALUE IF NOT EXISTS 'NEEDS_HUMAN_REVIEW'")

    op.add_column(
        "AnalysisRun",
        sa.Column("maxAttempts", sa.Integer(), nullable=False, server_default="3"),
    )

    op.create_table(
        "FixAttempt",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("bugId", postgresql.UUID(as_uuid=False), sa.ForeignKey("Bug.id", ondelete="CASCADE"), nullable=False),
        sa.Column("analysisRunId", postgresql.UUID(as_uuid=False), sa.ForeignKey("AnalysisRun.id", ondelete="CASCADE"), nullable=False),
        sa.Column("attemptNumber", sa.Integer(), nullable=False),
        sa.Column("mode", sa.Enum("automatic", "manual", name="fixattemptmode"), nullable=False),
        sa.Column("triggerNote", sa.String(), nullable=True),
        sa.Column("triggerFileEdit", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("fixProposalId", postgresql.UUID(as_uuid=False), sa.ForeignKey("FixProposal.id", ondelete="SET NULL"), nullable=True),
        sa.Column("diffSnippet", sa.String(), nullable=False),
        sa.Column("previousAttemptId", postgresql.UUID(as_uuid=False), sa.ForeignKey("FixAttempt.id", ondelete="SET NULL"), nullable=True),
        sa.Column("resultStatus", sa.Enum("pending", "pass", "fail", name="fixattemptresult"), nullable=False),
        sa.Column("errorFingerprint", sa.String(), nullable=True),
        sa.Column("rawErrorOutput", sa.String(), nullable=True),
        sa.Column("linesAdded", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("linesRemoved", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_fixattempt_run", "FixAttempt", ["analysisRunId"])
    op.create_index("ix_fixattempt_fingerprint", "FixAttempt", ["errorFingerprint"])

    op.create_table(
        "PreviewCheckpoint",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("analysisRunId", postgresql.UUID(as_uuid=False), sa.ForeignKey("AnalysisRun.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("previewSessionId", sa.String(), nullable=True),
        sa.Column(
            "status",
            sa.Enum("awaiting_decision", "previewing", "resumed", "rejected", "timeout", name="checkpointstatus"),
            nullable=False,
        ),
        sa.Column("promptMessages", postgresql.JSONB(), nullable=True),
        sa.Column("fileEditsDetected", postgresql.JSONB(), nullable=True),
        sa.Column("createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("resumedAt", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("PreviewCheckpoint")
    op.drop_index("ix_fixattempt_fingerprint", table_name="FixAttempt")
    op.drop_index("ix_fixattempt_run", table_name="FixAttempt")
    op.drop_table("FixAttempt")
    op.drop_column("AnalysisRun", "maxAttempts")
    op.execute("DROP TYPE IF EXISTS checkpointstatus")
    op.execute("DROP TYPE IF EXISTS fixattemptresult")
    op.execute("DROP TYPE IF EXISTS fixattemptmode")
    # AWAITING_REVIEW / NEEDS_HUMAN_REVIEW are intentionally left on
    # analysisstatus: Postgres cannot remove enum values without rebuilding
    # the type, and any row still using them would break the downgrade.