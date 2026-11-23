"""Create the generation job queue and link reports to jobs."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261123_0013"
down_revision: str | Sequence[str] | None = "20261123_0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "generation_job",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("requester_id", sa.BigInteger(), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("client_request_key", sa.String(length=100), nullable=False),
        sa.Column("request_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("request_digest", sa.String(length=64), nullable=False),
        sa.Column("state", sa.String(length=20), server_default="accepted", nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("data_cutoff_at", sa.DateTime(timezone=True)),
        sa.Column("claimed_at", sa.DateTime(timezone=True)),
        sa.Column("heartbeat_at", sa.DateTime(timezone=True)),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True)),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.Column("error_code", sa.String(length=100)),
        sa.Column("safe_error_message", sa.String(length=500)),
        sa.Column("retry_of_id", sa.BigInteger()),
        sa.Column("attempt_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("kind IN ('report', 'chat')", name="ck_generation_job_kind"),
        sa.CheckConstraint(
            "state IN ('accepted', 'querying', 'writing', 'succeeded', "
            "'failed', 'interrupted', 'cancelled')",
            name="ck_generation_job_state",
        ),
        sa.CheckConstraint("attempt_count >= 0", name="ck_generation_job_attempt_count"),
        sa.ForeignKeyConstraint(["requester_id"], ["app_user.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["retry_of_id"], ["generation_job.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "requester_id", "kind", "client_request_key", name="uq_generation_job_request"
        ),
    )
    op.create_index("ix_generation_job_queue", "generation_job", ["state", "accepted_at", "id"])
    op.create_index(
        "ix_generation_job_requester", "generation_job", ["requester_id", "accepted_at", "id"]
    )
    op.create_index("ix_generation_job_lease", "generation_job", ["state", "lease_expires_at"])

    op.add_column("report", sa.Column("generation_job_id", sa.BigInteger()))
    op.create_unique_constraint("uq_report_generation_job", "report", ["generation_job_id"])
    op.create_foreign_key(
        "fk_report_generation_job",
        "report",
        "generation_job",
        ["generation_job_id"],
        ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint("fk_report_generation_job", "report", type_="foreignkey")
    op.drop_constraint("uq_report_generation_job", "report", type_="unique")
    op.drop_column("report", "generation_job_id")
    op.drop_index("ix_generation_job_lease", table_name="generation_job")
    op.drop_index("ix_generation_job_requester", table_name="generation_job")
    op.drop_index("ix_generation_job_queue", table_name="generation_job")
    op.drop_table("generation_job")
