from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.common import TimestampMixin

STOCK_MOVEMENT_KINDS = ("initial", "receipt", "issue", "adjustment", "correction")


class StockBalance(TimestampMixin, Base):
    __tablename__ = "stock_balance"
    __table_args__ = (CheckConstraint("quantity >= 0", name="ck_stock_balance_quantity"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column(
        ForeignKey("product.id", ondelete="RESTRICT"), unique=True, nullable=False
    )
    quantity: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0", nullable=False)


class StockMovement(Base):
    __tablename__ = "stock_movement"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('initial', 'receipt', 'issue', 'adjustment', 'correction')",
            name="ck_stock_movement_kind",
        ),
        CheckConstraint("delta <> 0", name="ck_stock_movement_delta"),
        Index("ix_stock_movement_product", "product_id", "created_at", "id"),
        Index("ix_stock_movement_original", "original_movement_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column(
        ForeignKey("product.id", ondelete="RESTRICT"), nullable=False
    )
    actor_id: Mapped[int] = mapped_column(
        ForeignKey("app_user.id", ondelete="RESTRICT"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    delta: Mapped[int] = mapped_column(BigInteger, nullable=False)
    reason: Mapped[str | None] = mapped_column(String(500))
    original_movement_id: Mapped[int | None] = mapped_column(
        ForeignKey("stock_movement.id", ondelete="RESTRICT")
    )
    checked_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("app_user.id", ondelete="RESTRICT")
    )
    checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
