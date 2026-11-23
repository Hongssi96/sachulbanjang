"""Create report, revision, and status event tables."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261123_0012"
down_revision: str | Sequence[str] | None = "20261123_0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_STATUS_CHECK = "business_status IN ('pending', 'in_progress', 'completed')"
_CATEGORY_CHECK = (
    "category IN ("
    "'equipment_issue', 'quality_report', 'inspection_done', "
    "'periodic_weekly', 'periodic_monthly', 'other'"
    ")"
)


def upgrade() -> None:
    op.create_table(
        "report",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("author_id", sa.BigInteger(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body_markdown", sa.Text(), nullable=False),
        sa.Column("category", sa.String(length=30), nullable=False),
        sa.Column("report_kind", sa.String(length=20), nullable=False),
        sa.Column(
            "business_status", sa.String(length=20), server_default="pending", nullable=False
        ),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("last_editor_id", sa.BigInteger()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint(_CATEGORY_CHECK, name="ck_report_category"),
        sa.CheckConstraint(
            "report_kind IN ('general', 'weekly', 'monthly')", name="ck_report_kind"
        ),
        sa.CheckConstraint(_STATUS_CHECK, name="ck_report_business_status"),
        sa.CheckConstraint("version > 0", name="ck_report_version"),
        sa.ForeignKeyConstraint(["author_id"], ["app_user.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["last_editor_id"], ["app_user.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_report_author_created", "report", ["author_id", "created_at", "id"])
    op.create_index("ix_report_created", "report", ["created_at", "id"])

    op.create_table(
        "report_revision",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("report_id", sa.BigInteger(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body_markdown", sa.Text(), nullable=False),
        sa.Column("editor_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["editor_id"], ["app_user.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["report_id"], ["report.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("report_id", "version", name="uq_report_revision_report_version"),
    )
    op.create_index("ix_report_revision_report", "report_revision", ["report_id", "created_at"])

    op.create_table(
        "report_status_event",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("report_id", sa.BigInteger(), nullable=False),
        sa.Column("before_status", sa.String(length=20), nullable=False),
        sa.Column("after_status", sa.String(length=20), nullable=False),
        sa.Column("actor_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "before_status IN ('pending', 'in_progress', 'completed')",
            name="ck_report_status_event_before",
        ),
        sa.CheckConstraint(
            "after_status IN ('pending', 'in_progress', 'completed')",
            name="ck_report_status_event_after",
        ),
        sa.ForeignKeyConstraint(["actor_id"], ["app_user.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["report_id"], ["report.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_report_status_event_report", "report_status_event", ["report_id", "created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_report_status_event_report", table_name="report_status_event")
    op.drop_table("report_status_event")
    op.drop_index("ix_report_revision_report", table_name="report_revision")
    op.drop_table("report_revision")
    op.drop_index("ix_report_created", table_name="report")
    op.drop_index("ix_report_author_created", table_name="report")
    op.drop_table("report")
