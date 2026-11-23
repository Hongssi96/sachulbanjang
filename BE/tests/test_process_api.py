from datetime import UTC, datetime, time
from decimal import Decimal
from unittest.mock import MagicMock

from app.core.config import Settings
from app.dependencies.auth import get_current_user
from app.main import create_app
from app.models.master import AppUser, Equipment, Product
from app.models.process import ProcessRecord, ProcessReplay
from app.repositories.process_replay import CurrentProcessRecord
from app.routers.process import get_current_process_service
from app.services.process_replay import CurrentProcessResult, CurrentProcessService
from fastapi import FastAPI
from fastapi.testclient import TestClient

NOW = datetime(2026, 11, 20, 3, 0, tzinfo=UTC)
DATA_TIME = datetime(2020, 1, 1, 16, 0, tzinfo=UTC)


def make_settings() -> Settings:
    return Settings(
        _env_file=None,
        database_url="postgresql+psycopg://user:password@localhost/database",
        jwt_secret="test-secret-that-is-at-least-32-characters",
    )


def make_user() -> AppUser:
    return AppUser(
        id=1,
        employee_no="E001",
        display_name="테스트 사용자",
        password_hash="unused",
        role="worker",
        must_change_password=False,
        shift_start_local=time(9, 0),
        shift_end_local=time(18, 0),
        failed_login_count=0,
        version=1,
    )


def make_service_result() -> CurrentProcessResult:
    replay = ProcessReplay(
        id=1,
        source_import_id=10,
        cursor=1,
        state="running",
        data_time=DATA_TIME,
        last_advanced_at=NOW,
    )
    equipment = Equipment(id=20, equipment_code="S01", name="사출기 1")
    product = Product(id=30, product_code=None, name="시연 제품")
    record = ProcessRecord(
        id=1,
        source_import_id=10,
        source_row_number=1,
        equipment_id=20,
        product_id=30,
        occurred_at=DATA_TIME,
        available_at=NOW,
        cycle_time_seconds=Decimal("12.345"),
        source_namespace="test",
        source_record_key="row-1",
        source_payload={"_id": "row-1"},
        is_demo=True,
        version=1,
    )
    return CurrentProcessResult(
        queried_at=NOW,
        replay=replay,
        replay_state="running",
        records=[CurrentProcessRecord(record=record, equipment=equipment, product=product)],
    )


def make_application(service: CurrentProcessService | None = None) -> FastAPI:
    application = create_app(
        settings=make_settings(),
        migration_checker=lambda engine, path: None,
    )
    application.dependency_overrides[get_current_user] = make_user
    if service is not None:
        application.dependency_overrides[get_current_process_service] = lambda: service
    return application


def test_current_process_requires_authentication() -> None:
    application = create_app(
        settings=make_settings(),
        migration_checker=lambda engine, path: None,
    )

    with TestClient(application) as client:
        response = client.get("/api/v1/process/current")

    assert response.status_code == 401
    assert response.json()["code"] == "AUTHENTICATION_REQUIRED"


def test_current_process_returns_contract_fields() -> None:
    service = MagicMock(spec=CurrentProcessService)
    service.get_current.return_value = make_service_result()

    with TestClient(make_application(service)) as client:
        response = client.get("/api/v1/process/current", params={"equipment_id": 20})

    assert response.status_code == 200
    assert response.json() == {
        "queried_at": "2026-11-20T03:00:00Z",
        "replay_id": 1,
        "replay_state": "running",
        "data_time": "2020-01-01T16:00:00Z",
        "last_advanced_at": "2026-11-20T03:00:00Z",
        "items": [
            {
                "equipment_id": 20,
                "equipment_code": "S01",
                "equipment_name": "사출기 1",
                "equipment_status": "unknown",
                "product_id": 30,
                "product_code": None,
                "product_name": "시연 제품",
                "cycle_time_seconds": "12.345",
                "occurred_at": "2020-01-01T16:00:00Z",
                "available_at": "2026-11-20T03:00:00Z",
                "is_demo": True,
            }
        ],
    }
    service.get_current.assert_called_once_with(equipment_id=20)


def test_current_process_rejects_non_positive_equipment_id() -> None:
    service = MagicMock(spec=CurrentProcessService)

    with TestClient(make_application(service)) as client:
        response = client.get("/api/v1/process/current", params={"equipment_id": 0})

    assert response.status_code == 422
    service.get_current.assert_not_called()
