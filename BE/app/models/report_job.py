from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.common import TimestampMixin

GENERATION_JOB_KINDS = ("report", "chat")
GENERATION_JOB_STATES = (
    "accepted",
    "querying",
    "writing",
    "succeeded",
    "failed",
    "interrupted",
    "cancelled",
)
TERMINAL_JOB_STATES = ("succeeded", "failed", "interrupted", "cancelled")


class GenerationJob(TimestampMixin, Base):
    __tablename__ = "generation_job"
    __table_args__ = (
        CheckConstraint("kind IN ('report', 'chat')", name="ck_generation_job_kind"),
        CheckConstraint(
            "state IN ('accepted', 'querying', 'writing', 'succeeded', "
            "'failed', 'interrupted', 'cancelled')",
            name="ck_generation_job_state",
        ),
        CheckConstraint("attempt_count >= 0", name="ck_generation_job_attempt_count"),
        UniqueConstraint(
            "requester_id", "kind", "client_request_key", name="uq_generation_job_request"
        ),
        Index("ix_generation_job_queue", "state", "accepted_at", "id"),
        Index("ix_generation_job_requester", "requester_id", "accepted_at", "id"),
        Index("ix_generation_job_lease", "state", "lease_expires_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    requester_id: Mapped[int] = mapped_column(
        ForeignKey("app_user.id", ondelete="RESTRICT"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    client_request_key: Mapped[str] = mapped_column(String(100), nullable=False)
    request_payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    request_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    state: Mapped[str] = mapped_column(
        String(20), default="accepted", server_default="accepted", nullable=False
    )
    accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    data_cutoff_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_code: Mapped[str | None] = mapped_column(String(100))
    safe_error_message: Mapped[str | None] = mapped_column(String(500))
    retry_of_id: Mapped[int | None] = mapped_column(
        ForeignKey("generation_job.id", ondelete="RESTRICT")
    )
    attempt_count: Mapped[int] = mapped_column(default=0, server_default="0", nullable=False)
