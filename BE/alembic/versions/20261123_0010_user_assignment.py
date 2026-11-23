"""Create the user assignment table."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261123_0010"
down_revision: str | Sequence[str] | None = "20261123_0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_assignment",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("department_id", sa.BigInteger()),
        sa.Column("production_line_id", sa.BigInteger()),
        sa.Column("equipment_id", sa.BigInteger()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint(
            "((department_id IS NOT NULL)::integer + (production_line_id IS NOT NULL)::integer "
            "+ (equipment_id IS NOT NULL)::integer) = 1",
            name="ck_user_assignment_single_target",
        ),
        sa.ForeignKeyConstraint(["department_id"], ["department.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["equipment_id"], ["equipment.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["production_line_id"], ["production_line.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["app_user.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "uq_user_assignment_department",
        "user_assignment",
        ["user_id", "department_id"],
        unique=True,
        postgresql_where=sa.text("department_id IS NOT NULL AND deleted_at IS NULL"),
    )
    op.create_index(
        "uq_user_assignment_production_line",
        "user_assignment",
        ["user_id", "production_line_id"],
        unique=True,
        postgresql_where=sa.text("production_line_id IS NOT NULL AND deleted_at IS NULL"),
    )
    op.create_index(
        "uq_user_assignment_equipment",
        "user_assignment",
        ["user_id", "equipment_id"],
        unique=True,
        postgresql_where=sa.text("equipment_id IS NOT NULL AND deleted_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_user_assignment_equipment", table_name="user_assignment")
    op.drop_index("uq_user_assignment_production_line", table_name="user_assignment")
    op.drop_index("uq_user_assignment_department", table_name="user_assignment")
    op.drop_table("user_assignment")
