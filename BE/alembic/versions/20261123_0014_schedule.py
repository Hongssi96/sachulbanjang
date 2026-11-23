"""Create the schedule table."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261123_0014"
down_revision: str | Sequence[str] | None = "20261123_0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_SHAPE_CHECK = (
    "(all_day AND start_date IS NOT NULL AND end_date_exclusive IS NOT NULL "
    "AND starts_at IS NULL AND ends_at IS NULL) OR "
    "(NOT all_day AND starts_at IS NOT NULL AND ends_at IS NOT NULL "
    "AND start_date IS NULL AND end_date_exclusive IS NULL)"
)
_RANGE_CHECK = (
    "(all_day OR ends_at > starts_at) AND (NOT all_day OR end_date_exclusive > start_date)"
)


def upgrade() -> None:
    op.create_table(
        "schedule",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("author_id", sa.BigInteger(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("category", sa.String(length=20), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("all_day", sa.Boolean(), nullable=False),
        sa.Column("start_date", sa.Date()),
        sa.Column("end_date_exclusive", sa.Date()),
        sa.Column("starts_at", sa.DateTime(timezone=True)),
        sa.Column("ends_at", sa.DateTime(timezone=True)),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint(
            "category IN ('inspection', 'production', 'meeting', 'other')",
            name="ck_schedule_category",
        ),
        sa.CheckConstraint(_SHAPE_CHECK, name="ck_schedule_shape"),
        sa.CheckConstraint(_RANGE_CHECK, name="ck_schedule_range"),
        sa.CheckConstraint("version > 0", name="ck_schedule_version"),
        sa.ForeignKeyConstraint(["author_id"], ["app_user.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_schedule_author", "schedule", ["author_id", "id"])
    op.create_index("ix_schedule_starts_at", "schedule", ["starts_at"])
    op.create_index("ix_schedule_start_date", "schedule", ["start_date"])


def downgrade() -> None:
    op.drop_index("ix_schedule_start_date", table_name="schedule")
    op.drop_index("ix_schedule_starts_at", table_name="schedule")
    op.drop_index("ix_schedule_author", table_name="schedule")
    op.drop_table("schedule")
