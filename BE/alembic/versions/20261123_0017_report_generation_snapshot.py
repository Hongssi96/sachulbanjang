"""Store the immutable aggregate used for an AI-generated report."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261123_0017"
down_revision: str | None = "20261123_0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "report",
        sa.Column("generation_data_cutoff_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "report",
        sa.Column("generation_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("report", "generation_snapshot")
    op.drop_column("report", "generation_data_cutoff_at")
