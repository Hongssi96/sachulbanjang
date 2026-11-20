"""Create CSV import, process record, and replay tables."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261120_0003"
down_revision: str | Sequence[str] | None = "20261120_0002"
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
        "source_import",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("source_name", sa.String(length=255), nullable=False),
        sa.Column("source_fingerprint", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.Column("error_code", sa.String(length=100)),
        *_timestamps(),
        sa.CheckConstraint(
            "status IN ('pending', 'importing', 'completed', 'failed')",
            name="ck_source_import_status",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source_fingerprint"),
    )
    op.create_table(
        "process_record",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("source_import_id", sa.BigInteger(), nullable=False),
        sa.Column("source_row_number", sa.BigInteger(), nullable=False),
        sa.Column("equipment_id", sa.BigInteger(), nullable=False),
        sa.Column("product_id", sa.BigInteger()),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("available_at", sa.DateTime(timezone=True)),
        sa.Column("cycle_time_seconds", sa.Numeric(precision=12, scale=3)),
        sa.Column("source_namespace", sa.String(length=100), nullable=False),
        sa.Column("source_record_key", sa.String(length=255), nullable=False),
        sa.Column("source_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        *_timestamps(),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint(
            "cycle_time_seconds IS NULL OR cycle_time_seconds >= 0",
            name="ck_process_record_cycle_time_seconds",
        ),
        sa.CheckConstraint("source_row_number > 0", name="ck_process_record_source_row_number"),
        sa.CheckConstraint("version > 0", name="ck_process_record_version"),
        sa.ForeignKeyConstraint(["equipment_id"], ["equipment.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["product_id"], ["product.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["source_import_id"], ["source_import.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "source_import_id", "source_row_number", name="uq_process_record_import_row"
        ),
    )
    op.create_index(
        "ix_process_record_equipment_occurred",
        "process_record",
        ["equipment_id", "occurred_at", "id"],
    )
    op.create_index(
        "ix_process_record_product_occurred",
        "process_record",
        ["product_id", "occurred_at", "id"],
    )
    op.create_table(
        "process_replay",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("source_import_id", sa.BigInteger(), nullable=False),
        sa.Column("cursor", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("data_time", sa.DateTime(timezone=True)),
        sa.Column("last_advanced_at", sa.DateTime(timezone=True)),
        sa.Column("state", sa.String(length=20), nullable=False),
        sa.Column("error_code", sa.String(length=100)),
        *_timestamps(),
        sa.CheckConstraint("cursor >= 0", name="ck_process_replay_cursor"),
        sa.CheckConstraint(
            "state IN ('ready', 'running', 'completed', 'failed')",
            name="ck_process_replay_state",
        ),
        sa.ForeignKeyConstraint(["source_import_id"], ["source_import.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source_import_id"),
    )


def downgrade() -> None:
    op.drop_table("process_replay")
    op.drop_index("ix_process_record_product_occurred", table_name="process_record")
    op.drop_index("ix_process_record_equipment_occurred", table_name="process_record")
    op.drop_table("process_record")
    op.drop_table("source_import")
