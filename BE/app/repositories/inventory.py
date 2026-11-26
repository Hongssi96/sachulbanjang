from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.orm import Session

from app.models.master import AppUser, Product
from app.models.stock import StockBalance, StockMovement


@dataclass(frozen=True)
class StockRow:
    product: Product
    quantity: int
    balance_updated_at: datetime | None = None


@dataclass(frozen=True)
class MovementRow:
    movement: StockMovement
    product_code: str | None
    product_name: str
    actor_display_name: str


class InventoryRepository:
    """Data access for stock balances and the movement ledger."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def lock_product(self, product_id: int) -> Product | None:
        return self._session.scalar(
            select(Product)
            .where(Product.id == product_id, Product.deleted_at.is_(None))
            .with_for_update()
        )

    def find_product(self, product_id: int) -> Product | None:
        return self._session.scalar(
            select(Product).where(Product.id == product_id, Product.deleted_at.is_(None))
        )

    def get_balance(self, product_id: int) -> StockBalance | None:
        return self._session.scalar(
            select(StockBalance).where(StockBalance.product_id == product_id)
        )

    def add_balance(self, balance: StockBalance) -> None:
        self._session.add(balance)
        self._session.flush()

    def add_movement(self, movement: StockMovement) -> None:
        self._session.add(movement)
        self._session.flush()

    def find_movement(self, movement_id: int) -> StockMovement | None:
        return self._session.get(StockMovement, movement_id)

    def find_movement_for_update(self, movement_id: int) -> StockMovement | None:
        return self._session.scalar(
            select(StockMovement).where(StockMovement.id == movement_id).with_for_update()
        )

    def _movement_conditions(
        self,
        *,
        product_id: int | None,
        kind: str | None,
        period_from: datetime | None,
        period_to: datetime | None,
    ) -> list[ColumnElement[bool]]:
        conditions: list[ColumnElement[bool]] = []
        if product_id is not None:
            conditions.append(StockMovement.product_id == product_id)
        if kind is not None:
            conditions.append(StockMovement.kind == kind)
        if period_from is not None:
            conditions.append(StockMovement.created_at >= period_from)
        if period_to is not None:
            conditions.append(StockMovement.created_at < period_to)
        return conditions

    def count_movements(
        self,
        *,
        product_id: int | None,
        kind: str | None,
        period_from: datetime | None,
        period_to: datetime | None,
    ) -> int:
        conditions = self._movement_conditions(
            product_id=product_id, kind=kind, period_from=period_from, period_to=period_to
        )
        return (
            self._session.scalar(select(func.count()).select_from(StockMovement).where(*conditions))
            or 0
        )

    def find_movements(
        self,
        *,
        product_id: int | None,
        kind: str | None,
        period_from: datetime | None,
        period_to: datetime | None,
        offset: int,
        limit: int,
    ) -> list[MovementRow]:
        conditions = self._movement_conditions(
            product_id=product_id, kind=kind, period_from=period_from, period_to=period_to
        )
        rows = self._session.execute(
            select(StockMovement, Product.product_code, Product.name, AppUser.display_name)
            .join(Product, Product.id == StockMovement.product_id)
            .join(AppUser, AppUser.id == StockMovement.actor_id)
            .where(*conditions)
            .order_by(StockMovement.created_at.desc(), StockMovement.id.desc())
            .offset(offset)
            .limit(limit)
        )
        return [
            MovementRow(
                movement=movement,
                product_code=product_code,
                product_name=product_name,
                actor_display_name=actor_name,
            )
            for movement, product_code, product_name, actor_name in rows
        ]

    def find_movement_row(self, movement_id: int) -> MovementRow | None:
        row = self._session.execute(
            select(StockMovement, Product.product_code, Product.name, AppUser.display_name)
            .join(Product, Product.id == StockMovement.product_id)
            .join(AppUser, AppUser.id == StockMovement.actor_id)
            .where(StockMovement.id == movement_id)
        ).first()
        if row is None:
            return None
        movement, product_code, product_name, actor_name = row
        return MovementRow(
            movement=movement,
            product_code=product_code,
            product_name=product_name,
            actor_display_name=actor_name,
        )

    def count_stocks(self, *, query: str | None, low_stock_only: bool) -> int:
        conditions = self._stock_conditions(query=query, low_stock_only=low_stock_only)
        return (
            self._session.scalar(
                select(func.count())
                .select_from(Product)
                .outerjoin(StockBalance, StockBalance.product_id == Product.id)
                .where(*conditions)
            )
            or 0
        )

    def _stock_conditions(
        self, *, query: str | None, low_stock_only: bool
    ) -> list[ColumnElement[bool]]:
        conditions: list[ColumnElement[bool]] = [Product.deleted_at.is_(None)]
        if low_stock_only:
            conditions.append(Product.minimum_stock.is_not(None))
            conditions.append(func.coalesce(StockBalance.quantity, 0) < Product.minimum_stock)
        if query:
            escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            pattern = f"%{escaped}%"
            conditions.append(
                or_(
                    Product.name.ilike(pattern, escape="\\"),
                    Product.product_code.ilike(pattern, escape="\\"),
                )
            )
        return conditions

    def find_stocks(
        self, *, query: str | None, low_stock_only: bool, offset: int, limit: int
    ) -> list[StockRow]:
        conditions = self._stock_conditions(query=query, low_stock_only=low_stock_only)
        rows = self._session.execute(
            select(Product, func.coalesce(StockBalance.quantity, 0), StockBalance.updated_at)
            .outerjoin(StockBalance, StockBalance.product_id == Product.id)
            .where(*conditions)
            .order_by(Product.name.asc(), Product.id.asc())
            .offset(offset)
            .limit(limit)
        )
        return [
            StockRow(product=product, quantity=int(quantity), balance_updated_at=updated_at)
            for product, quantity, updated_at in rows
        ]
