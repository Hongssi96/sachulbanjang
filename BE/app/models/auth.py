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
        CheckConstraint("work_session_version > 0", name="ck_auth_session_work_session_version"),
        Index("ix_auth_session_user", "user_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("app_user.id", ondelete="RESTRICT"), nullable=False
    )
    absolute_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    work_ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    work_session_version: Mapped[int] = mapped_column(
        default=1, server_default=text("1"), nullable=False
    )
    auto_extended_for: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
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


class WorkExtension(TimestampMixin, Base):
    """Audit record for a manual or activity-driven work-session extension."""

    __tablename__ = "work_extension"
    __table_args__ = (
        CheckConstraint("kind IN ('manual', 'automatic')", name="ck_work_extension_kind"),
        Index(
            "uq_work_extension_automatic_end",
            "session_id",
            "previous_ends_at",
            unique=True,
            postgresql_where=text("kind = 'automatic'"),
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("auth_session.id", ondelete="RESTRICT"), nullable=False
    )
    actor_id: Mapped[int] = mapped_column(
        ForeignKey("app_user.id", ondelete="RESTRICT"), nullable=False
    )
    previous_ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    new_ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
