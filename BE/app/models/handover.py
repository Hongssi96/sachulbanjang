from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.common import SoftDeleteMixin, TimestampMixin


class HandoverNote(TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "handover_note"
    __table_args__ = (
        CheckConstraint("version > 0", name="ck_handover_note_version"),
        Index("ix_handover_note_created", "created_at", "id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    author_id: Mapped[int] = mapped_column(
        ForeignKey("app_user.id", ondelete="RESTRICT"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    version: Mapped[int] = mapped_column(default=1, server_default="1", nullable=False)


class HandoverTarget(Base):
    __tablename__ = "handover_target"
    __table_args__ = (
        CheckConstraint(
            "((department_id IS NOT NULL)::integer + (production_line_id IS NOT NULL)::integer "
            "+ (equipment_id IS NOT NULL)::integer) = 1",
            name="ck_handover_target_single_target",
        ),
        Index("ix_handover_target_note", "handover_note_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    handover_note_id: Mapped[int] = mapped_column(
        ForeignKey("handover_note.id", ondelete="RESTRICT"), nullable=False
    )
    department_id: Mapped[int | None] = mapped_column(
        ForeignKey("department.id", ondelete="RESTRICT")
    )
    production_line_id: Mapped[int | None] = mapped_column(
        ForeignKey("production_line.id", ondelete="RESTRICT")
    )
    equipment_id: Mapped[int | None] = mapped_column(
        ForeignKey("equipment.id", ondelete="RESTRICT")
    )


class HandoverRead(Base):
    __tablename__ = "handover_read"
    __table_args__ = (
        UniqueConstraint("handover_note_id", "user_id", name="uq_handover_read_note_user"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    handover_note_id: Mapped[int] = mapped_column(
        ForeignKey("handover_note.id", ondelete="RESTRICT"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("app_user.id", ondelete="RESTRICT"), nullable=False
    )
    confirmed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
