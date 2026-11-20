from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.common import TimestampMixin


class AuthSession(TimestampMixin, Base):
    """Login session whose refresh credentials rotate independently per device."""

    __tablename__ = "auth_session"
    __table_args__ = (
        CheckConstraint(
            "current_refresh_generation > 0", name="ck_auth_session_refresh_generation"
        ),
        Index("ix_auth_session_user", "user_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("app_user.id", ondelete="RESTRICT"), nullable=False
    )
    absolute_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    current_refresh_generation: Mapped[int] = mapped_column(
        default=1, server_default=text("1"), nullable=False
    )


class RefreshCredential(TimestampMixin, Base):
    """Refresh token digest used for rotation and reuse detection."""

    __tablename__ = "refresh_credential"
    __table_args__ = (
        CheckConstraint("generation > 0", name="ck_refresh_credential_generation"),
        UniqueConstraint(
            "session_id", "generation", name="uq_refresh_credential_session_generation"
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("auth_session.id", ondelete="RESTRICT"), nullable=False
    )
    token_digest: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    generation: Mapped[int] = mapped_column(nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
