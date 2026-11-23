from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime

from sqlalchemy.orm import Session

from app.models.master import AppUser, Product
from app.models.stock import StockBalance, StockMovement
from app.repositories.inventory import InventoryRepository, MovementRow, StockRow
from app.services.record_history import period_bounds

Clock = Callable[[], datetime]

_CREATABLE_KINDS = {"initial", "receipt", "issue", "adjustment"}


def _utc_now() -> datetime:
    return datetime.now(UTC)


class InventoryError(Exception):
    """Base exception for rejected stock operations."""


class ProductNotFoundError(InventoryError):
    """Raised when the product does not exist or is soft-deleted."""


class MovementNotFoundError(InventoryError):
    """Raised when a ledger movement does not exist."""


class InsufficientStockError(InventoryError):
    """Raised when a movement would make the balance negative."""


class StockAlreadyCheckedError(InventoryError):
    """Raised when a movement was already confirmed by an administrator."""


class InvalidMovementError(InventoryError):
    """Raised for a movement that is not allowed or changes nothing."""


class MovementForbiddenError(InventoryError):
    """Raised when a worker edits another author's or a checked movement."""


@dataclass(frozen=True)
class MovementResult:
    movement: StockMovement
    quantity_after: int


@dataclass(frozen=True)
class StockPage:
    rows: list[StockRow]
    total_items: int


@dataclass(frozen=True)
class MovementPage:
    rows: list[MovementRow]
    total_items: int


class InventoryService:
    """Stock balances and the movement ledger with negative-stock protection."""

    def __init__(
        self,
        session: Session,
        repository: InventoryRepository,
        clock: Clock = _utc_now,
    ) -> None:
        self._session = session
        self._repository = repository
        self._clock = clock

    def list_stocks(
        self, *, query: str | None, low_stock_only: bool, page: int, page_size: int
    ) -> StockPage:
        normalized = query.strip() if query is not None else ""
        total_items = self._repository.count_stocks(
            query=normalized or None, low_stock_only=low_stock_only
        )
        rows = self._repository.find_stocks(
            query=normalized or None,
            low_stock_only=low_stock_only,
            offset=(page - 1) * page_size,
            limit=page_size,
        )
        return StockPage(rows=rows, total_items=total_items)

    def list_movements(
        self,
        *,
        product_id: int | None,
        kind: str | None,
        date_from: date | None,
        date_to: date | None,
        page: int,
        page_size: int,
    ) -> MovementPage:
        period_from, period_to = period_bounds(date_from, date_to)
        total_items = self._repository.count_movements(
            product_id=product_id, kind=kind, period_from=period_from, period_to=period_to
        )
        rows = self._repository.find_movements(
            product_id=product_id,
            kind=kind,
            period_from=period_from,
            period_to=period_to,
            offset=(page - 1) * page_size,
            limit=page_size,
        )
        return MovementPage(rows=rows, total_items=total_items)

    def register_movement(
        self,
        actor: AppUser,
        *,
        product_id: int,
        kind: str,
        quantity: int,
        reason: str | None,
    ) -> MovementResult:
        if kind not in _CREATABLE_KINDS:
            raise InvalidMovementError
        product = self._repository.lock_product(product_id)
        if product is None:
            raise ProductNotFoundError
        if kind == "initial" and actor.role != "admin":
            raise MovementForbiddenError

        balance = self._repository.get_balance(product_id)
        current = balance.quantity if balance is not None else 0
        if kind == "initial" and balance is not None:
            raise InvalidMovementError

        if kind == "receipt":
            delta = quantity
        elif kind == "issue":
            delta = -quantity
        elif kind == "initial":
            delta = quantity
        else:
            delta = quantity - current
        if delta == 0:
            raise InvalidMovementError

        quantity_after = current + delta
        if quantity_after < 0:
            raise InsufficientStockError

        if balance is None:
            balance = StockBalance(product_id=product_id, quantity=0)
            self._repository.add_balance(balance)
        balance.quantity = quantity_after
        movement = self._build_movement(
            actor=actor,
            product_id=product_id,
            kind=kind,
            delta=delta,
            reason=reason,
            original_movement_id=None,
        )
        self._repository.add_movement(movement)
        self._session.commit()
        return MovementResult(movement=movement, quantity_after=quantity_after)

    def add_correction(
        self, actor: AppUser, movement_id: int, *, delta: int, reason: str
    ) -> MovementResult:
        original = self._repository.find_movement(movement_id)
        if original is None:
            raise MovementNotFoundError
        if original.kind == "correction":
            raise InvalidMovementError

        product = self._repository.lock_product(original.product_id)
        if product is None:
            raise ProductNotFoundError
        original = self._repository.find_movement_for_update(movement_id)
        if original is None:
            raise MovementNotFoundError
        if actor.role != "admin" and (
            original.actor_id != actor.id or original.checked_at is not None
        ):
            raise MovementForbiddenError

        balance = self._repository.get_balance(original.product_id)
        current = balance.quantity if balance is not None else 0
        quantity_after = current + delta
        if quantity_after < 0:
            raise InsufficientStockError
        if delta == 0:
            raise InvalidMovementError

        if balance is None:
            balance = StockBalance(product_id=original.product_id, quantity=0)
            self._repository.add_balance(balance)
        balance.quantity = quantity_after
        movement = self._build_movement(
            actor=actor,
            product_id=original.product_id,
            kind="correction",
            delta=delta,
            reason=reason,
            original_movement_id=original.id,
        )
        self._repository.add_movement(movement)
        self._session.commit()
        return MovementResult(movement=movement, quantity_after=quantity_after)

    def confirm_movement(self, actor: AppUser, movement_id: int) -> MovementResult:
        movement = self._repository.find_movement_for_update(movement_id)
        if movement is None:
            raise MovementNotFoundError
        if movement.checked_at is not None:
            raise StockAlreadyCheckedError
        movement.checked_by_id = actor.id
        movement.checked_at = self._clock()
        self._session.commit()
        balance = self._repository.get_balance(movement.product_id)
        return MovementResult(
            movement=movement, quantity_after=balance.quantity if balance is not None else 0
        )

    def set_minimum_stock(
        self, actor: AppUser, product_id: int, minimum_stock: int | None
    ) -> Product:
        product = self._repository.lock_product(product_id)
        if product is None:
            raise ProductNotFoundError
        product.minimum_stock = minimum_stock
        self._session.commit()
        return product

    def _build_movement(
        self,
        *,
        actor: AppUser,
        product_id: int,
        kind: str,
        delta: int,
        reason: str | None,
        original_movement_id: int | None,
    ) -> StockMovement:
        now = self._clock()
        is_admin = actor.role == "admin"
        return StockMovement(
            product_id=product_id,
            actor_id=actor.id,
            kind=kind,
            delta=delta,
            reason=reason,
            original_movement_id=original_movement_id,
            checked_by_id=actor.id if is_admin else None,
            checked_at=now if is_admin else None,
            created_at=now,
        )
