"""Add work-session end and extension state."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261123_0006"
down_revision: str | Sequence[str] | None = "20261120_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("auth_session", sa.Column("work_ends_at", sa.DateTime(timezone=True)))
    op.add_column(
        "auth_session",
        sa.Column(
            "work_session_version", sa.Integer(), server_default=sa.text("1"), nullable=False
        ),
    )
    op.add_column("auth_session", sa.Column("auto_extended_for", sa.DateTime(timezone=True)))
    op.execute("UPDATE auth_session SET work_ends_at = absolute_expires_at")
    op.alter_column("auth_session", "work_ends_at", nullable=False)
    op.create_check_constraint(
        "ck_auth_session_work_session_version", "auth_session", "work_session_version > 0"
    )
    op.create_table(
        "work_extension",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("session_id", sa.BigInteger(), nullable=False),
        sa.Column("actor_id", sa.BigInteger(), nullable=False),
        sa.Column("previous_ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("new_ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("kind IN ('manual', 'automatic')", name="ck_work_extension_kind"),
        sa.ForeignKeyConstraint(["actor_id"], ["app_user.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["session_id"], ["auth_session.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "uq_work_extension_automatic_end",
        "work_extension",
        ["session_id", "previous_ends_at"],
        unique=True,
        postgresql_where=sa.text("kind = 'automatic'"),
    )


def downgrade() -> None:
    op.drop_index("uq_work_extension_automatic_end", table_name="work_extension")
    op.drop_table("work_extension")
    op.drop_constraint("ck_auth_session_work_session_version", "auth_session", type_="check")
    op.drop_column("auth_session", "auto_extended_for")
    op.drop_column("auth_session", "work_session_version")
    op.drop_column("auth_session", "work_ends_at")
