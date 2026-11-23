"""Add the temporary password expiry time to accounts."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261123_0007"
down_revision: str | Sequence[str] | None = "20261123_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "app_user",
        sa.Column("temporary_password_expires_at", sa.DateTime(timezone=True)),
    )


def downgrade() -> None:
    op.drop_column("app_user", "temporary_password_expires_at")
