"""Create the account management audit trail."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261123_0008"
down_revision: str | Sequence[str] | None = "20261123_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "account_audit_event",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("actor_id", sa.BigInteger(), nullable=False),
        sa.Column("action", sa.String(length=30), nullable=False),
        sa.Column("detail", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "action IN ("
            "'user_created', 'password_reset', 'user_updated', "
            "'user_deactivated', 'user_reactivated'"
            ")",
            name="ck_account_audit_event_action",
        ),
        sa.ForeignKeyConstraint(["actor_id"], ["app_user.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["user_id"], ["app_user.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_account_audit_event_user", "account_audit_event", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_account_audit_event_user", table_name="account_audit_event")
    op.drop_table("account_audit_event")
