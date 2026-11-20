from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.common import SoftDeleteMixin, TimestampMixin


class SourceImport(TimestampMixin, Base):
    __tablename__ = "source_import"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'importing', 'completed', 'failed')",
            name="ck_source_import_status",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    source_name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_fingerprint: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_code: Mapped[str | None] = mapped_column(String(100))

    process_records: Mapped[list[ProcessRecord]] = relationship(back_populates="source_import")
    replay: Mapped[ProcessReplay | None] = relationship(back_populates="source_import")


class ProcessRecord(TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "process_record"
    __table_args__ = (
        CheckConstraint("source_row_number > 0", name="ck_process_record_source_row_number"),
        CheckConstraint(
            "cycle_time_seconds IS NULL OR cycle_time_seconds >= 0",
            name="ck_process_record_cycle_time_seconds",
        ),
        CheckConstraint("version > 0", name="ck_process_record_version"),
        UniqueConstraint(
            "source_import_id", "source_row_number", name="uq_process_record_import_row"
        ),
        UniqueConstraint(
            "source_namespace", "source_record_key", name="uq_process_record_source_key"
        ),
        Index("ix_process_record_equipment_occurred", "equipment_id", "occurred_at", "id"),
        Index("ix_process_record_product_occurred", "product_id", "occurred_at", "id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    source_import_id: Mapped[int] = mapped_column(
        ForeignKey("source_import.id", ondelete="RESTRICT"), nullable=False
    )
    source_row_number: Mapped[int] = mapped_column(BigInteger, nullable=False)
    equipment_id: Mapped[int] = mapped_column(
        ForeignKey("equipment.id", ondelete="RESTRICT"), nullable=False
    )
    product_id: Mapped[int | None] = mapped_column(ForeignKey("product.id", ondelete="RESTRICT"))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    available_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cycle_time_seconds: Mapped[Decimal | None] = mapped_column(Numeric(12, 3))
    source_namespace: Mapped[str] = mapped_column(String(100), nullable=False)
    source_record_key: Mapped[str] = mapped_column(String(255), nullable=False)
    source_payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    version: Mapped[int] = mapped_column(default=1, nullable=False)

    source_import: Mapped[SourceImport] = relationship(back_populates="process_records")
    equipment: Mapped[Equipment] = relationship(back_populates="process_records")
    product: Mapped[Product | None] = relationship(back_populates="process_records")


class ProcessReplay(TimestampMixin, Base):
    __tablename__ = "process_replay"
    __table_args__ = (
        CheckConstraint("cursor >= 0", name="ck_process_replay_cursor"),
        CheckConstraint(
            "state IN ('ready', 'running', 'completed', 'failed')",
            name="ck_process_replay_state",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    source_import_id: Mapped[int] = mapped_column(
        ForeignKey("source_import.id", ondelete="RESTRICT"), unique=True, nullable=False
    )
    cursor: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    data_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_advanced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    state: Mapped[str] = mapped_column(String(20), nullable=False)
    error_code: Mapped[str | None] = mapped_column(String(100))

    source_import: Mapped[SourceImport] = relationship(back_populates="replay")


from app.models.master import Equipment, Product  # noqa: E402
