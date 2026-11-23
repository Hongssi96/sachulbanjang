"""Create stock balance and movement ledger tables."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261123_0015"
down_revision: str | Sequence[str] | None = "20261123_0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "stock_balance",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("product_id", sa.BigInteger(), nullable=False),
        sa.Column("quantity", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("quantity >= 0", name="ck_stock_balance_quantity"),
        sa.ForeignKeyConstraint(["product_id"], ["product.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("product_id"),
    )
    op.create_table(
        "stock_movement",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("product_id", sa.BigInteger(), nullable=False),
        sa.Column("actor_id", sa.BigInteger(), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("delta", sa.BigInteger(), nullable=False),
        sa.Column("reason", sa.String(length=500)),
        sa.Column("original_movement_id", sa.BigInteger()),
        sa.Column("checked_by_id", sa.BigInteger()),
        sa.Column("checked_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "kind IN ('initial', 'receipt', 'issue', 'adjustment', 'correction')",
            name="ck_stock_movement_kind",
        ),
        sa.CheckConstraint("delta <> 0", name="ck_stock_movement_delta"),
        sa.ForeignKeyConstraint(["actor_id"], ["app_user.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["checked_by_id"], ["app_user.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["original_movement_id"], ["stock_movement.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["product_id"], ["product.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_stock_movement_product", "stock_movement", ["product_id", "created_at", "id"]
    )
    op.create_index("ix_stock_movement_original", "stock_movement", ["original_movement_id"])


def downgrade() -> None:
    op.drop_index("ix_stock_movement_original", table_name="stock_movement")
    op.drop_index("ix_stock_movement_product", table_name="stock_movement")
    op.drop_table("stock_movement")
    op.drop_table("stock_balance")
