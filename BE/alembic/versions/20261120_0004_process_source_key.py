"""Make process source keys unique within a namespace."""

from collections.abc import Sequence

from alembic import op

revision: str = "20261120_0004"
down_revision: str | Sequence[str] | None = "20261120_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_unique_constraint(
        "uq_process_record_source_key",
        "process_record",
        ["source_namespace", "source_record_key"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_process_record_source_key", "process_record", type_="unique")
