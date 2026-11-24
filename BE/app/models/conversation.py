from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.common import SoftDeleteMixin, TimestampMixin

_EVIDENCE_SOURCE_CHECK = (
    "((report_id IS NOT NULL)::integer + (process_record_id IS NOT NULL)::integer "
    "+ (inspection_record_id IS NOT NULL)::integer + (product_id IS NOT NULL)::integer) >= 1"
)


class Conversation(TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "conversation"
    __table_args__ = (Index("ix_conversation_owner_updated", "owner_id", "updated_at", "id"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("app_user.id", ondelete="RESTRICT"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)


class ChatTurn(TimestampMixin, Base):
    __tablename__ = "chat_turn"
    __table_args__ = (
        Index("ix_chat_turn_conversation", "conversation_id", "created_at", "id"),
        Index("ix_chat_turn_active_job", "active_job_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("conversation.id", ondelete="RESTRICT"), nullable=False
    )
    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str | None] = mapped_column(Text)
    active_job_id: Mapped[int | None] = mapped_column(
        ForeignKey("generation_job.id", ondelete="RESTRICT")
    )
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    query_scope: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    data_cutoff_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_demo: Mapped[bool | None] = mapped_column(Boolean)


class AnswerEvidence(Base):
    __tablename__ = "answer_evidence"
    __table_args__ = (
        CheckConstraint(_EVIDENCE_SOURCE_CHECK, name="ck_answer_evidence_source"),
        Index("ix_answer_evidence_turn", "chat_turn_id", "id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    chat_turn_id: Mapped[int] = mapped_column(
        ForeignKey("chat_turn.id", ondelete="RESTRICT"), nullable=False
    )
    report_id: Mapped[int | None] = mapped_column(ForeignKey("report.id", ondelete="RESTRICT"))
    process_record_id: Mapped[int | None] = mapped_column(
        ForeignKey("process_record.id", ondelete="RESTRICT")
    )
    inspection_record_id: Mapped[int | None] = mapped_column(
        ForeignKey("inspection_record.id", ondelete="RESTRICT")
    )
    product_id: Mapped[int | None] = mapped_column(ForeignKey("product.id", ondelete="RESTRICT"))
    source_version: Mapped[int | None] = mapped_column(Integer)
    source_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
