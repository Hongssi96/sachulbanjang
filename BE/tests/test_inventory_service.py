from datetime import UTC, date, datetime, time
from unittest.mock import MagicMock

import pytest
from app.models.master import AppUser, Product
from app.models.stock import StockBalance, StockMovement
from app.repositories.inventory import InventoryRepository, StockRow
from app.services.inventory import (
    InsufficientStockError,
    InvalidMovementError,
    InventoryService,
    MovementForbiddenError,
    MovementNotFoundError,
    ProductNotFoundError,
    StockAlreadyCheckedError,
)
from sqlalchemy.orm import Session

NOW = datetime(2026, 11, 23, 9, 0, tzinfo=UTC)


def make_user(user_id: int = 1, role: str = "worker") -> AppUser:
    return AppUser(
        id=user_id,
        employee_no=f"E{user_id:03d}",
        display_name="사용자",
        password_hash="unused",
        role=role,
        must_change_password=False,
        shift_start_local=time(9, 0),
        shift_end_local=time(18, 0),
        version=1,
    )


def make_product(product_id: int = 5) -> Product:
    return Product(id=product_id, product_code="P-1", name="완제품", minimum_stock=None)


def make_balance(quantity: int) -> StockBalance:
    return StockBalance(id=1, product_id=5, quantity=quantity)


def make_movement(
    *,
    movement_id: int = 1,
    product_id: int = 5,
    actor_id: int = 1,
    kind: str = "receipt",
    delta: int = 5,
    checked_at: datetime | None = None,
) -> StockMovement:
    return StockMovement(
        id=movement_id,
        product_id=product_id,
        actor_id=actor_id,
        kind=kind,
        delta=delta,
        reason=None,
        original_movement_id=None,
        checked_by_id=None,
        checked_at=checked_at,
        created_at=NOW,
    )


def build_service() -> tuple[InventoryService, MagicMock, MagicMock]:
    session = MagicMock(spec=Session)
    repository = MagicMock(spec=InventoryRepository)
    service = InventoryService(session, repository, clock=lambda: NOW)
    return service, repository, session


def test_receipt_creates_balance_and_worker_movement_is_unchecked() -> None:
    service, repository, session = build_service()
    repository.lock_product.return_value = make_product()
    repository.get_balance.return_value = None

    result = service.register_movement(
        make_user(), product_id=5, kind="receipt", quantity=10, reason=None
    )

    assert result.quantity_after == 10
    balance = repository.add_balance.call_args.args[0]
    assert balance.quantity == 10
    movement = repository.add_movement.call_args.args[0]
    assert movement.kind == "receipt"
    assert movement.delta == 10
    assert movement.checked_at is None
    session.commit.assert_called_once_with()


def test_admin_receipt_is_auto_checked() -> None:
    service, repository, _ = build_service()
    repository.lock_product.return_value = make_product()
    repository.get_balance.return_value = None

    service.register_movement(
        make_user(user_id=9, role="admin"), product_id=5, kind="receipt", quantity=4, reason=None
    )

    movement = repository.add_movement.call_args.args[0]
    assert movement.checked_by_id == 9
    assert movement.checked_at == NOW


def test_issue_blocks_negative_stock() -> None:
    service, repository, session = build_service()
    repository.lock_product.return_value = make_product()
    repository.get_balance.return_value = make_balance(3)

    with pytest.raises(InsufficientStockError):
        service.register_movement(make_user(), product_id=5, kind="issue", quantity=5, reason=None)

    repository.add_movement.assert_not_called()
    session.commit.assert_not_called()


def test_adjustment_uses_target_quantity() -> None:
    service, repository, _ = build_service()
    repository.lock_product.return_value = make_product()
    repository.get_balance.return_value = make_balance(10)

    result = service.register_movement(
        make_user(), product_id=5, kind="adjustment", quantity=7, reason="실사 반영"
    )

    assert result.quantity_after == 7
    assert repository.add_movement.call_args.args[0].delta == -3

    with pytest.raises(InvalidMovementError):
        service.register_movement(
            make_user(), product_id=5, kind="adjustment", quantity=7, reason="동일"
        )


def test_initial_stock_is_admin_only_and_single() -> None:
    service, repository, _ = build_service()
    repository.lock_product.return_value = make_product()
    repository.get_balance.return_value = None

    with pytest.raises(MovementForbiddenError):
        service.register_movement(
            make_user(), product_id=5, kind="initial", quantity=10, reason=None
        )

    repository.get_balance.return_value = make_balance(10)
    with pytest.raises(InvalidMovementError):
        service.register_movement(
            make_user(role="admin"), product_id=5, kind="initial", quantity=10, reason=None
        )


def test_missing_product_is_rejected() -> None:
    service, repository, _ = build_service()
    repository.lock_product.return_value = None

    with pytest.raises(ProductNotFoundError):
        service.register_movement(
            make_user(), product_id=5, kind="receipt", quantity=1, reason=None
        )


def test_list_stocks_and_movements_apply_filters() -> None:
    service, repository, _ = build_service()
    repository.count_stocks.return_value = 1
    repository.find_stocks.return_value = [StockRow(product=make_product(), quantity=10)]
    repository.count_movements.return_value = 1
    repository.find_movements.return_value = []

    stocks = service.list_stocks(query="  완제품  ", low_stock_only=True, page=2, page_size=10)
    assert stocks.total_items == 1
    repository.find_stocks.assert_called_once_with(
        query="완제품", low_stock_only=True, offset=10, limit=10
    )

    service.list_movements(
        product_id=5,
        kind="issue",
        date_from=date(2026, 11, 23),
        date_to=None,
        page=1,
        page_size=10,
    )
    repository.find_movements.assert_called_once_with(
        product_id=5,
        kind="issue",
        period_from=datetime(2026, 11, 22, 15, 0, tzinfo=UTC),
        period_to=None,
        offset=0,
        limit=10,
    )


def test_correction_permissions_and_negative_block() -> None:
    service, repository, _ = build_service()
    original = make_movement(actor_id=1, kind="receipt", delta=10, checked_at=None)
    repository.find_movement.return_value = original
    repository.lock_product.return_value = make_product()
    repository.find_movement_for_update.return_value = original

    repository.get_balance.return_value = make_balance(10)
    result = service.add_correction(make_user(), 1, delta=-2, reason="과입고 정정")
    assert result.quantity_after == 8
    correction = repository.add_movement.call_args.args[0]
    assert correction.kind == "correction"
    assert correction.original_movement_id == 1

    checked = make_movement(actor_id=1, checked_at=NOW)
    repository.find_movement.return_value = checked
    repository.find_movement_for_update.return_value = checked
    with pytest.raises(MovementForbiddenError):
        service.add_correction(make_user(), 1, delta=1, reason="x")

    unchecked = make_movement(actor_id=1)
    repository.find_movement.return_value = unchecked
    repository.find_movement_for_update.return_value = unchecked
    repository.get_balance.return_value = make_balance(1)
    with pytest.raises(InsufficientStockError):
        service.add_correction(make_user(), 1, delta=-5, reason="x")

    repository.find_movement.return_value = None
    with pytest.raises(MovementNotFoundError):
        service.add_correction(make_user(role="admin"), 1, delta=1, reason="x")


def test_confirm_movement_sets_checked_once() -> None:
    service, repository, session = build_service()
    movement = make_movement(checked_at=None)
    repository.find_movement_for_update.return_value = movement
    repository.get_balance.return_value = make_balance(10)

    result = service.confirm_movement(make_user(role="admin"), 1)

    assert movement.checked_by_id == 1
    assert movement.checked_at == NOW
    assert result.quantity_after == 10
    session.commit.assert_called_once_with()

    movement.checked_at = NOW
    with pytest.raises(StockAlreadyCheckedError):
        service.confirm_movement(make_user(role="admin"), 1)


def test_set_minimum_stock() -> None:
    service, repository, session = build_service()
    repository.lock_product.return_value = make_product()

    product = service.set_minimum_stock(make_user(role="admin"), 5, 20)

    assert product.minimum_stock == 20
    session.commit.assert_called_once_with()

    repository.lock_product.return_value = None
    with pytest.raises(ProductNotFoundError):
        service.set_minimum_stock(make_user(role="admin"), 5, None)
