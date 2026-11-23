"""Create handover note, target, and read tables."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261123_0016"
down_revision: str | Sequence[str] | None = "20261123_0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_SINGLE_TARGET = (
    "((department_id IS NOT NULL)::integer + (production_line_id IS NOT NULL)::integer "
    "+ (equipment_id IS NOT NULL)::integer) = 1"
)


def upgrade() -> None:
    op.create_table(
        "handover_note",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("author_id", sa.BigInteger(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("version > 0", name="ck_handover_note_version"),
        sa.ForeignKeyConstraint(["author_id"], ["app_user.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_handover_note_created", "handover_note", ["created_at", "id"])

    op.create_table(
        "handover_target",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("handover_note_id", sa.BigInteger(), nullable=False),
        sa.Column("department_id", sa.BigInteger()),
        sa.Column("production_line_id", sa.BigInteger()),
        sa.Column("equipment_id", sa.BigInteger()),
        sa.CheckConstraint(_SINGLE_TARGET, name="ck_handover_target_single_target"),
        sa.ForeignKeyConstraint(["department_id"], ["department.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["equipment_id"], ["equipment.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["handover_note_id"], ["handover_note.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["production_line_id"], ["production_line.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_handover_target_note", "handover_target", ["handover_note_id"])

    op.create_table(
        "handover_read",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("handover_note_id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "confirmed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["handover_note_id"], ["handover_note.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["user_id"], ["app_user.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("handover_note_id", "user_id", name="uq_handover_read_note_user"),
    )


def downgrade() -> None:
    op.drop_table("handover_read")
    op.drop_index("ix_handover_target_note", table_name="handover_target")
    op.drop_table("handover_target")
    op.drop_index("ix_handover_note_created", table_name="handover_note")
    op.drop_table("handover_note")
