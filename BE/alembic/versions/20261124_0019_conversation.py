"""Create conversation history tables for AI chat."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261124_0019"
down_revision: str | Sequence[str] | None = "20261123_0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_EVIDENCE_SOURCE_CHECK = (
    "((report_id IS NOT NULL)::integer + (process_record_id IS NOT NULL)::integer "
    "+ (inspection_record_id IS NOT NULL)::integer + (product_id IS NOT NULL)::integer) >= 1"
)


def upgrade() -> None:
    op.create_table(
        "conversation",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("owner_id", sa.BigInteger(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.ForeignKeyConstraint(["owner_id"], ["app_user.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_conversation_owner_updated", "conversation", ["owner_id", "updated_at", "id"]
    )

    op.create_table(
        "chat_turn",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("conversation_id", sa.BigInteger(), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("answer", sa.Text()),
        sa.Column("active_job_id", sa.BigInteger()),
        sa.Column("answered_at", sa.DateTime(timezone=True)),
        sa.Column("query_scope", postgresql.JSONB(astext_type=sa.Text())),
        sa.Column("data_cutoff_at", sa.DateTime(timezone=True)),
        sa.Column("is_demo", sa.Boolean()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversation.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["active_job_id"], ["generation_job.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_chat_turn_conversation", "chat_turn", ["conversation_id", "created_at", "id"]
    )
    op.create_index("ix_chat_turn_active_job", "chat_turn", ["active_job_id"])

    op.create_table(
        "answer_evidence",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("chat_turn_id", sa.BigInteger(), nullable=False),
        sa.Column("report_id", sa.BigInteger()),
        sa.Column("process_record_id", sa.BigInteger()),
        sa.Column("inspection_record_id", sa.BigInteger()),
        sa.Column("product_id", sa.BigInteger()),
        sa.Column("source_version", sa.Integer()),
        sa.Column("source_time", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(_EVIDENCE_SOURCE_CHECK, name="ck_answer_evidence_source"),
        sa.ForeignKeyConstraint(["chat_turn_id"], ["chat_turn.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["report_id"], ["report.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["process_record_id"], ["process_record.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["inspection_record_id"], ["inspection_record.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["product_id"], ["product.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_answer_evidence_turn", "answer_evidence", ["chat_turn_id", "id"])


def downgrade() -> None:
    op.drop_index("ix_answer_evidence_turn", table_name="answer_evidence")
    op.drop_table("answer_evidence")
    op.drop_index("ix_chat_turn_active_job", table_name="chat_turn")
    op.drop_index("ix_chat_turn_conversation", table_name="chat_turn")
    op.drop_table("chat_turn")
    op.drop_index("ix_conversation_owner_updated", table_name="conversation")
    op.drop_table("conversation")
