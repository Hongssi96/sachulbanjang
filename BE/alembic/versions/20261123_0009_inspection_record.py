"""Create the inspection record table and history query indexes."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261123_0009"
down_revision: str | Sequence[str] | None = "20261123_0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "inspection_record",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("equipment_id", sa.BigInteger(), nullable=False),
        sa.Column("product_id", sa.BigInteger()),
        sa.Column("process_record_id", sa.BigInteger()),
        sa.Column("inspected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("available_at", sa.DateTime(timezone=True)),
        sa.Column("verdict", sa.String(length=20), nullable=False),
        sa.Column("defect_type", sa.String(length=100)),
        sa.Column("reason", sa.String(length=500)),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("verdict IN ('good', 'defect')", name="ck_inspection_record_verdict"),
        sa.CheckConstraint("version > 0", name="ck_inspection_record_version"),
        sa.ForeignKeyConstraint(["equipment_id"], ["equipment.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["product_id"], ["product.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["process_record_id"], ["process_record.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_inspection_record_equipment_inspected",
        "inspection_record",
        ["equipment_id", "inspected_at", "id"],
    )
    op.create_index(
        "ix_inspection_record_product_inspected",
        "inspection_record",
        ["product_id", "inspected_at", "id"],
    )
    op.create_index(
        "ix_inspection_record_verdict_inspected",
        "inspection_record",
        ["verdict", "inspected_at", "id"],
    )
    op.create_index("ix_inspection_record_inspected", "inspection_record", ["inspected_at", "id"])
    op.create_index("ix_process_record_occurred", "process_record", ["occurred_at", "id"])


def downgrade() -> None:
    op.drop_index("ix_process_record_occurred", table_name="process_record")
    op.drop_index("ix_inspection_record_inspected", table_name="inspection_record")
    op.drop_index("ix_inspection_record_verdict_inspected", table_name="inspection_record")
    op.drop_index("ix_inspection_record_product_inspected", table_name="inspection_record")
    op.drop_index("ix_inspection_record_equipment_inspected", table_name="inspection_record")
    op.drop_table("inspection_record")
