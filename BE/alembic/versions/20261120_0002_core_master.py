"""Create account, organization, equipment, and product master tables."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261120_0002"
down_revision: str | Sequence[str] | None = "20261119_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _timestamps() -> list[sa.Column[object]]:
    return [
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    ]


def upgrade() -> None:
    op.create_table(
        "app_user",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("employee_no", sa.String(length=50), nullable=False),
        sa.Column("display_name", sa.String(length=100), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("must_change_password", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("shift_start_local", sa.Time(), nullable=False),
        sa.Column("shift_end_local", sa.Time(), nullable=False),
        sa.Column("failed_login_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("locked_until", sa.DateTime(timezone=True)),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        *_timestamps(),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("role IN ('admin', 'worker')", name="ck_app_user_role"),
        sa.CheckConstraint("failed_login_count >= 0", name="ck_app_user_failed_login_count"),
        sa.CheckConstraint("version > 0", name="ck_app_user_version"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("employee_no"),
    )
    op.create_table(
        "department",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        *_timestamps(),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )
    op.create_table(
        "product",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("product_code", sa.String(length=100)),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("minimum_stock", sa.BigInteger()),
        *_timestamps(),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint(
            "minimum_stock IS NULL OR minimum_stock >= 0", name="ck_product_minimum_stock"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("product_code"),
    )
    op.create_table(
        "production_line",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("department_id", sa.BigInteger(), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        *_timestamps(),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.ForeignKeyConstraint(["department_id"], ["department.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("department_id", "code", name="uq_production_line_department_code"),
    )
    op.create_table(
        "equipment",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("production_line_id", sa.BigInteger()),
        sa.Column("equipment_code", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        *_timestamps(),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.ForeignKeyConstraint(
            ["production_line_id"], ["production_line.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("equipment_code"),
    )


def downgrade() -> None:
    op.drop_table("equipment")
    op.drop_table("production_line")
    op.drop_table("product")
    op.drop_table("department")
    op.drop_table("app_user")
