"""Create the operation day table for equipment run-time statistics."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261124_0020"
down_revision: str | Sequence[str] | None = "20261124_0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "operation_day",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("equipment_id", sa.BigInteger(), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("planned_seconds", sa.Integer(), nullable=False),
        sa.Column("actual_seconds", sa.Integer(), nullable=False),
        sa.Column("is_demo", sa.Boolean(), server_default="true", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("planned_seconds >= 0", name="ck_operation_day_planned"),
        sa.CheckConstraint("actual_seconds >= 0", name="ck_operation_day_actual"),
        sa.ForeignKeyConstraint(["equipment_id"], ["equipment.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("equipment_id", "day", name="uq_operation_day_equipment_day"),
    )
    op.create_index("ix_operation_day_day", "operation_day", ["day", "id"])


def downgrade() -> None:
    op.drop_index("ix_operation_day_day", table_name="operation_day")
    op.drop_table("operation_day")
