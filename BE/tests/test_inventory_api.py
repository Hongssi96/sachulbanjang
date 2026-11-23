from datetime import UTC, datetime, time
from unittest.mock import MagicMock

from app.core.config import Settings
from app.dependencies.auth import get_current_user
from app.main import create_app
from app.models.master import AppUser, Product
from app.models.stock import StockMovement
from app.repositories.inventory import MovementRow, StockRow
from app.routers.inventory import get_inventory_service
from app.services.inventory import (
    InsufficientStockError,
    InvalidMovementError,
    InventoryService,
    MovementForbiddenError,
    MovementPage,
    ProductNotFoundError,
    StockAlreadyCheckedError,
    StockPage,
)
from app.services.inventory import (
    MovementResult as MovementOutcome,
)
from fastapi import FastAPI
from fastapi.testclient import TestClient

NOW = datetime(2026, 11, 23, 9, 0, tzinfo=UTC)


def make_settings() -> Settings:
    return Settings(
        _env_file=None,
        database_url="postgresql+psycopg://user:password@localhost/database",
        jwt_secret="test-secret-that-is-at-least-32-characters",
    )


def make_user(role: str = "worker") -> AppUser:
    return AppUser(
        id=1,
        employee_no="E001",
        display_name="사용자",
        password_hash="unused",
        role=role,
        must_change_password=False,
        shift_start_local=time(9, 0),
        shift_end_local=time(18, 0),
        version=1,
    )


def make_product(minimum_stock: int | None = None) -> Product:
    return Product(id=5, product_code="P-1", name="완제품", minimum_stock=minimum_stock)


def make_movement() -> StockMovement:
    return StockMovement(
        id=1,
        product_id=5,
        actor_id=1,
        kind="receipt",
        delta=10,
        reason=None,
        original_movement_id=None,
        checked_by_id=None,
        checked_at=None,
        created_at=NOW,
    )


def make_application(service: InventoryService | None = None) -> FastAPI:
    application = create_app(
        settings=make_settings(),
        migration_checker=lambda engine, path: None,
    )
    application.dependency_overrides[get_current_user] = make_user
    if service is not None:
        application.dependency_overrides[get_inventory_service] = lambda: service
    return application


def with_csrf(client: TestClient) -> dict[str, str]:
    settings = make_settings()
    client.cookies.set(settings.csrf_cookie_name, "csrf-token")
    return {"X-CSRF-Token": "csrf-token"}


def test_inventory_requires_authentication() -> None:
    application = create_app(settings=make_settings(), migration_checker=lambda engine, path: None)

    with TestClient(application) as client:
        response = client.get("/api/v1/stocks")

    assert response.status_code == 401
    assert response.json()["code"] == "AUTHENTICATION_REQUIRED"


def test_list_stocks_marks_low_stock() -> None:
    service = MagicMock(spec=InventoryService)
    service.list_stocks.return_value = StockPage(
        rows=[StockRow(product=make_product(minimum_stock=20), quantity=5)], total_items=1
    )
    application = make_application(service)

    with TestClient(application) as client:
        response = client.get("/api/v1/stocks", params={"low_stock": True})

    assert response.status_code == 200
    assert response.json()["items"][0] == {
        "product_id": 5,
        "product_code": "P-1",
        "name": "완제품",
        "quantity": 5,
        "minimum_stock": 20,
        "is_low_stock": True,
    }
    service.list_stocks.assert_called_once_with(
        query=None, low_stock_only=True, page=1, page_size=10
    )


def test_list_movements_returns_items() -> None:
    service = MagicMock(spec=InventoryService)
    service.list_movements.return_value = MovementPage(
        rows=[
            MovementRow(
                movement=make_movement(),
                product_code="P-1",
                product_name="완제품",
                actor_display_name="사용자",
            )
        ],
        total_items=1,
    )
    application = make_application(service)

    with TestClient(application) as client:
        response = client.get("/api/v1/stock-movements", params={"product_id": 5})
        reversed_period = client.get(
            "/api/v1/stock-movements", params={"from": "2026-11-24", "to": "2026-11-20"}
        )

    assert response.status_code == 200
    assert response.json()["items"][0]["movement_id"] == 1
    assert response.json()["items"][0]["kind"] == "receipt"
    assert reversed_period.status_code == 422


def test_create_movement_returns_result() -> None:
    service = MagicMock(spec=InventoryService)
    service.register_movement.return_value = MovementOutcome(
        movement=make_movement(), quantity_after=10
    )
    application = make_application(service)

    with TestClient(application) as client:
        headers = with_csrf(client)
        response = client.post(
            "/api/v1/stock-movements",
            json={"product_id": 5, "kind": "receipt", "quantity": 10},
            headers=headers,
        )

    assert response.status_code == 201
    assert response.json() == {
        "movement_id": 1,
        "product_id": 5,
        "kind": "receipt",
        "delta": 10,
        "quantity_after": 10,
        "checked_at": None,
    }
    kwargs = service.register_movement.call_args.kwargs
    assert kwargs["product_id"] == 5
    assert kwargs["kind"] == "receipt"
    assert kwargs["quantity"] == 10


def test_create_movement_validates_payload() -> None:
    service = MagicMock(spec=InventoryService)
    application = make_application(service)

    with TestClient(application) as client:
        headers = with_csrf(client)
        adjustment_without_reason = client.post(
            "/api/v1/stock-movements",
            json={"product_id": 5, "kind": "adjustment", "quantity": 3},
            headers=headers,
        )
        zero_issue = client.post(
            "/api/v1/stock-movements",
            json={"product_id": 5, "kind": "issue", "quantity": 0},
            headers=headers,
        )

    assert adjustment_without_reason.status_code == 422
    assert zero_issue.status_code == 422
    service.register_movement.assert_not_called()


def test_create_movement_maps_domain_errors() -> None:
    application = make_application(MagicMock(spec=InventoryService))

    with TestClient(application) as client:
        headers = with_csrf(client)
        cases = [
            (InsufficientStockError(), 409, "INSUFFICIENT_STOCK"),
            (InvalidMovementError(), 422, "VALIDATION_ERROR"),
            (ProductNotFoundError(), 404, "NOT_FOUND"),
            (MovementForbiddenError(), 403, "FORBIDDEN"),
        ]
        for error, expected_status, expected_code in cases:
            service = MagicMock(spec=InventoryService)
            service.register_movement.side_effect = error
            application.dependency_overrides[get_inventory_service] = lambda s=service: s
            response = client.post(
                "/api/v1/stock-movements",
                json={"product_id": 5, "kind": "issue", "quantity": 1},
                headers=headers,
            )
            assert response.status_code == expected_status
            assert response.json()["code"] == expected_code


def test_correction_and_confirmation_endpoints() -> None:
    service = MagicMock(spec=InventoryService)
    correction = make_movement()
    correction.kind = "correction"
    service.add_correction.return_value = MovementOutcome(movement=correction, quantity_after=8)
    service.confirm_movement.return_value = MovementOutcome(
        movement=make_movement(), quantity_after=10
    )
    application = make_application(service)

    with TestClient(application) as client:
        headers = with_csrf(client)
        corrected = client.post(
            "/api/v1/stock-movements/1/corrections",
            json={"delta": -2, "reason": "과입고 정정"},
            headers=headers,
        )

    assert corrected.status_code == 201
    assert corrected.json()["kind"] == "correction"
    assert corrected.json()["quantity_after"] == 8

    service.confirm_movement.side_effect = StockAlreadyCheckedError
    application.dependency_overrides[get_current_user] = lambda: make_user(role="admin")
    with TestClient(application) as client:
        headers = with_csrf(client)
        already = client.post("/api/v1/stock-movements/1/confirmation", headers=headers)

    assert already.status_code == 409
    assert already.json()["code"] == "STOCK_ALREADY_CHECKED"


def test_confirmation_requires_admin() -> None:
    service = MagicMock(spec=InventoryService)
    application = create_app(settings=make_settings(), migration_checker=lambda engine, path: None)
    application.dependency_overrides[get_current_user] = lambda: make_user(role="worker")
    application.dependency_overrides[get_inventory_service] = lambda: service

    with TestClient(application) as client:
        headers = with_csrf(client)
        response = client.post("/api/v1/stock-movements/1/confirmation", headers=headers)

    assert response.status_code == 403
    assert response.json()["code"] == "FORBIDDEN"
    service.confirm_movement.assert_not_called()


def test_set_minimum_stock_requires_admin_and_validates() -> None:
    service = MagicMock(spec=InventoryService)
    product = make_product()
    product.minimum_stock = 20
    service.set_minimum_stock.return_value = product
    application = make_application(service)
    application.dependency_overrides[get_current_user] = lambda: make_user(role="admin")

    with TestClient(application) as client:
        headers = with_csrf(client)
        response = client.patch(
            "/api/v1/products/5/minimum-stock",
            json={"minimum_stock": 20},
            headers=headers,
        )
        negative = client.patch(
            "/api/v1/products/5/minimum-stock",
            json={"minimum_stock": -1},
            headers=headers,
        )

    assert response.status_code == 200
    assert response.json() == {"product_id": 5, "minimum_stock": 20}
    assert negative.status_code == 422

    worker_application = create_app(
        settings=make_settings(), migration_checker=lambda engine, path: None
    )
    worker_application.dependency_overrides[get_current_user] = lambda: make_user(role="worker")
    worker_application.dependency_overrides[get_inventory_service] = lambda: service
    with TestClient(worker_application) as client:
        headers = with_csrf(client)
        forbidden = client.patch(
            "/api/v1/products/5/minimum-stock",
            json={"minimum_stock": 20},
            headers=headers,
        )
    assert forbidden.status_code == 403
