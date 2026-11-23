from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.common import SoftDeleteMixin, TimestampMixin

SCHEDULE_CATEGORIES = ("inspection", "production", "meeting", "other")


class Schedule(TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "schedule"
    __table_args__ = (
        CheckConstraint(
            "category IN ('inspection', 'production', 'meeting', 'other')",
            name="ck_schedule_category",
        ),
        CheckConstraint(
            "(all_day AND start_date IS NOT NULL AND end_date_exclusive IS NOT NULL "
            "AND starts_at IS NULL AND ends_at IS NULL) OR "
            "(NOT all_day AND starts_at IS NOT NULL AND ends_at IS NOT NULL "
            "AND start_date IS NULL AND end_date_exclusive IS NULL)",
            name="ck_schedule_shape",
        ),
        CheckConstraint(
            "(all_day OR ends_at > starts_at) AND (NOT all_day OR end_date_exclusive > start_date)",
            name="ck_schedule_range",
        ),
        CheckConstraint("version > 0", name="ck_schedule_version"),
        Index("ix_schedule_author", "author_id", "id"),
        Index("ix_schedule_starts_at", "starts_at"),
        Index("ix_schedule_start_date", "start_date"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    author_id: Mapped[int] = mapped_column(
        ForeignKey("app_user.id", ondelete="RESTRICT"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(20), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    all_day: Mapped[bool] = mapped_column(Boolean, nullable=False)
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date_exclusive: Mapped[date | None] = mapped_column(Date)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(default=1, server_default="1", nullable=False)
