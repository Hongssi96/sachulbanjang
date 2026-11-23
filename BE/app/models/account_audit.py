from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

ACCOUNT_AUDIT_ACTIONS = (
    "user_created",
    "password_reset",
    "user_updated",
    "user_deactivated",
    "user_reactivated",
)


class AccountAuditEvent(Base):
    """Immutable administrator action trail for account management.

    Password values and temporary-password expiry times are never stored here.
    """

    __tablename__ = "account_audit_event"
    __table_args__ = (
        CheckConstraint(
            "action IN ("
            "'user_created', 'password_reset', 'user_updated', "
            "'user_deactivated', 'user_reactivated'"
            ")",
            name="ck_account_audit_event_action",
        ),
        Index("ix_account_audit_event_user", "user_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("app_user.id", ondelete="RESTRICT"), nullable=False
    )
    actor_id: Mapped[int] = mapped_column(
        ForeignKey("app_user.id", ondelete="RESTRICT"), nullable=False
    )
    action: Mapped[str] = mapped_column(String(30), nullable=False)
    detail: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


from app.models.master import AppUser  # noqa: E402,F401
