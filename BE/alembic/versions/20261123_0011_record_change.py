"""Create the process and inspection record change history."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261123_0011"
down_revision: str | Sequence[str] | None = "20261123_0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "record_change",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("process_record_id", sa.BigInteger()),
        sa.Column("inspection_record_id", sa.BigInteger()),
        sa.Column("actor_id", sa.BigInteger(), nullable=False),
        sa.Column("operation", sa.String(length=20), nullable=False),
        sa.Column("before_value", postgresql.JSONB(astext_type=sa.Text())),
        sa.Column("after_value", postgresql.JSONB(astext_type=sa.Text())),
        sa.Column("reason", sa.String(length=500), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("operation IN ('update', 'delete')", name="ck_record_change_operation"),
        sa.CheckConstraint(
            "((process_record_id IS NOT NULL)::integer "
            "+ (inspection_record_id IS NOT NULL)::integer) = 1",
            name="ck_record_change_single_record",
        ),
        sa.CheckConstraint("version > 0", name="ck_record_change_version"),
        sa.ForeignKeyConstraint(["actor_id"], ["app_user.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["inspection_record_id"], ["inspection_record.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["process_record_id"], ["process_record.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_record_change_process",
        "record_change",
        ["process_record_id", "occurred_at"],
    )
    op.create_index(
        "ix_record_change_inspection",
        "record_change",
        ["inspection_record_id", "occurred_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_record_change_inspection", table_name="record_change")
    op.drop_index("ix_record_change_process", table_name="record_change")
    op.drop_table("record_change")
