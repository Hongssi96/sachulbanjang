from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.common import SoftDeleteMixin, TimestampMixin

REPORT_CATEGORIES = (
    "equipment_issue",
    "quality_report",
    "inspection_done",
    "periodic_weekly",
    "periodic_monthly",
    "other",
)
REPORT_KINDS = ("general", "weekly", "monthly")
REPORT_STATUSES = ("pending", "in_progress", "completed")


class Report(TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "report"
    __table_args__ = (
        CheckConstraint(
            "category IN ("
            "'equipment_issue', 'quality_report', 'inspection_done', "
            "'periodic_weekly', 'periodic_monthly', 'other'"
            ")",
            name="ck_report_category",
        ),
        CheckConstraint("report_kind IN ('general', 'weekly', 'monthly')", name="ck_report_kind"),
        CheckConstraint(
            "business_status IN ('pending', 'in_progress', 'completed')",
            name="ck_report_business_status",
        ),
        CheckConstraint("version > 0", name="ck_report_version"),
        Index("ix_report_author_created", "author_id", "created_at", "id"),
        Index("ix_report_created", "created_at", "id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    author_id: Mapped[int] = mapped_column(
        ForeignKey("app_user.id", ondelete="RESTRICT"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body_markdown: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(30), nullable=False)
    report_kind: Mapped[str] = mapped_column(String(20), nullable=False)
    business_status: Mapped[str] = mapped_column(
        String(20), default="pending", server_default="pending", nullable=False
    )
    version: Mapped[int] = mapped_column(default=1, server_default="1", nullable=False)
    last_editor_id: Mapped[int | None] = mapped_column(
        ForeignKey("app_user.id", ondelete="RESTRICT")
    )


class ReportRevision(Base):
    __tablename__ = "report_revision"
    __table_args__ = (
        UniqueConstraint("report_id", "version", name="uq_report_revision_report_version"),
        Index("ix_report_revision_report", "report_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    report_id: Mapped[int] = mapped_column(
        ForeignKey("report.id", ondelete="RESTRICT"), nullable=False
    )
    version: Mapped[int] = mapped_column(nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body_markdown: Mapped[str] = mapped_column(Text, nullable=False)
    editor_id: Mapped[int] = mapped_column(
        ForeignKey("app_user.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ReportStatusEvent(Base):
    __tablename__ = "report_status_event"
    __table_args__ = (
        CheckConstraint(
            "before_status IN ('pending', 'in_progress', 'completed')",
            name="ck_report_status_event_before",
        ),
        CheckConstraint(
            "after_status IN ('pending', 'in_progress', 'completed')",
            name="ck_report_status_event_after",
        ),
        Index("ix_report_status_event_report", "report_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    report_id: Mapped[int] = mapped_column(
        ForeignKey("report.id", ondelete="RESTRICT"), nullable=False
    )
    before_status: Mapped[str] = mapped_column(String(20), nullable=False)
    after_status: Mapped[str] = mapped_column(String(20), nullable=False)
    actor_id: Mapped[int] = mapped_column(
        ForeignKey("app_user.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
