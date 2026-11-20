from __future__ import annotations

from datetime import datetime, time

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    String,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.common import SoftDeleteMixin, TimestampMixin


class AppUser(TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "app_user"
    __table_args__ = (
        CheckConstraint("role IN ('admin', 'worker')", name="ck_app_user_role"),
        CheckConstraint("failed_login_count >= 0", name="ck_app_user_failed_login_count"),
        CheckConstraint("version > 0", name="ck_app_user_version"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    employee_no: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    shift_start_local: Mapped[time] = mapped_column(Time, nullable=False)
    shift_end_local: Mapped[time] = mapped_column(Time, nullable=False)
    failed_login_count: Mapped[int] = mapped_column(default=0, nullable=False)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(default=1, nullable=False)


class Department(TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "department"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)

    production_lines: Mapped[list[ProductionLine]] = relationship(back_populates="department")


class ProductionLine(TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "production_line"
    __table_args__ = (
        UniqueConstraint("department_id", "code", name="uq_production_line_department_code"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    department_id: Mapped[int] = mapped_column(
        ForeignKey("department.id", ondelete="RESTRICT"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)

    department: Mapped[Department] = relationship(back_populates="production_lines")
    equipment: Mapped[list[Equipment]] = relationship(back_populates="production_line")


class Equipment(TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "equipment"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    production_line_id: Mapped[int | None] = mapped_column(
        ForeignKey("production_line.id", ondelete="RESTRICT")
    )
    equipment_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)

    production_line: Mapped[ProductionLine | None] = relationship(back_populates="equipment")
    process_records: Mapped[list[ProcessRecord]] = relationship(back_populates="equipment")


class Product(TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "product"
    __table_args__ = (
        CheckConstraint(
            "minimum_stock IS NULL OR minimum_stock >= 0", name="ck_product_minimum_stock"
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    product_code: Mapped[str | None] = mapped_column(String(100), unique=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    minimum_stock: Mapped[int | None] = mapped_column(BigInteger)

    process_records: Mapped[list[ProcessRecord]] = relationship(back_populates="product")


from app.models.process import ProcessRecord  # noqa: E402
