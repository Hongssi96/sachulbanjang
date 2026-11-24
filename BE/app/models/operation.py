from __future__ import annotations

from datetime import date

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    Integer,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.common import TimestampMixin


class OperationDay(TimestampMixin, Base):
    """Planned and actual equipment run time for one Korean calendar day."""

    __tablename__ = "operation_day"
    __table_args__ = (
        CheckConstraint("planned_seconds >= 0", name="ck_operation_day_planned"),
        CheckConstraint("actual_seconds >= 0", name="ck_operation_day_actual"),
        UniqueConstraint("equipment_id", "day", name="uq_operation_day_equipment_day"),
        Index("ix_operation_day_day", "day", "id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    equipment_id: Mapped[int] = mapped_column(
        ForeignKey("equipment.id", ondelete="RESTRICT"), nullable=False
    )
    day: Mapped[date] = mapped_column(Date, nullable=False)
    planned_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    actual_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    is_demo: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true", nullable=False
    )
