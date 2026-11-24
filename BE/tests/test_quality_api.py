from datetime import date, time
from decimal import Decimal
from unittest.mock import MagicMock

from app.core.config import Settings
from app.dependencies.auth import get_current_user
from app.main import create_app
from app.models.master import AppUser
from app.routers.quality import get_operation_service, get_quality_service
from app.services.operation import OperationService, OperationSummary
from app.services.quality import QualityService, QualitySummary
from fastapi import FastAPI
from fastapi.testclient import TestClient


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


def make_application(service: QualityService | None = None) -> FastAPI:
    application = create_app(
        settings=make_settings(),
        migration_checker=lambda engine, path: None,
    )
    application.dependency_overrides[get_current_user] = make_user
    if service is not None:
        application.dependency_overrides[get_quality_service] = lambda: service
    return application


def make_operation_application(service: OperationService | None = None) -> FastAPI:
    application = create_app(
        settings=make_settings(),
        migration_checker=lambda engine, path: None,
    )
    application.dependency_overrides[get_current_user] = make_user
    if service is not None:
        application.dependency_overrides[get_operation_service] = lambda: service
    return application


def test_quality_summary_requires_authentication() -> None:
    application = create_app(settings=make_settings(), migration_checker=lambda engine, path: None)

    with TestClient(application) as client:
        response = client.get("/api/v1/quality/summary")

    assert response.status_code == 401
    assert response.json()["code"] == "AUTHENTICATION_REQUIRED"


def test_worker_reads_quality_summary() -> None:
    service = MagicMock(spec=QualityService)
    service.get_summary.return_value = QualitySummary(
        inspected_count=3,
        good_count=2,
        defect_count=1,
        defect_rate=Decimal("33.33"),
        defect_types=[("scratch", 1), (None, 0)],
        production_record_count=9,
        includes_demo=True,
    )
    application = make_application(service)

    with TestClient(application) as client:
        response = client.get(
            "/api/v1/quality/summary",
            params={"equipment_id": 20, "from": "2026-11-20", "to": "2026-11-20"},
        )

    assert response.status_code == 200
    assert response.json() == {
        "inspected_count": 3,
        "good_count": 2,
        "defect_count": 1,
        "defect_rate": "33.33",
        "defect_types": [{"type": "scratch", "count": 1}, {"type": None, "count": 0}],
        "production_record_count": 9,
        "includes_demo": True,
    }
    service.get_summary.assert_called_once_with(
        equipment_id=20,
        product_id=None,
        date_from=date(2026, 11, 20),
        date_to=date(2026, 11, 20),
    )


def test_quality_summary_returns_null_rate() -> None:
    service = MagicMock(spec=QualityService)
    service.get_summary.return_value = QualitySummary(
        inspected_count=0,
        good_count=0,
        defect_count=0,
        defect_rate=None,
        defect_types=[],
        production_record_count=0,
        includes_demo=False,
    )
    application = make_application(service)

    with TestClient(application) as client:
        response = client.get("/api/v1/quality/summary")

    assert response.status_code == 200
    assert response.json()["defect_rate"] is None
    assert response.json()["defect_types"] == []
    assert response.json()["production_record_count"] == 0


def test_quality_summary_rejects_invalid_filters() -> None:
    service = MagicMock(spec=QualityService)
    application = make_application(service)

    with TestClient(application) as client:
        reversed_period = client.get(
            "/api/v1/quality/summary", params={"from": "2026-11-24", "to": "2026-11-20"}
        )
        zero_equipment = client.get("/api/v1/quality/summary", params={"equipment_id": 0})

    assert reversed_period.status_code == 422
    assert reversed_period.json()["code"] == "VALIDATION_ERROR"
    assert zero_equipment.status_code == 422
    service.get_summary.assert_not_called()


def test_operation_summary_requires_authentication() -> None:
    application = create_app(settings=make_settings(), migration_checker=lambda engine, path: None)

    with TestClient(application) as client:
        response = client.get("/api/v1/quality/operation")

    assert response.status_code == 401
    assert response.json()["code"] == "AUTHENTICATION_REQUIRED"


def test_worker_reads_operation_summary() -> None:
    service = MagicMock(spec=OperationService)
    service.get_summary.return_value = OperationSummary(
        planned_seconds=57600,
        actual_seconds=50400,
        rate=Decimal("87.50"),
        includes_demo=True,
    )
    application = make_operation_application(service)

    with TestClient(application) as client:
        response = client.get(
            "/api/v1/quality/operation",
            params={"equipment_id": 20, "from": "2026-11-18", "to": "2026-11-24"},
        )

    assert response.status_code == 200
    assert response.json() == {
        "equipment_id": 20,
        "from_date": "2026-11-18",
        "to_date": "2026-11-24",
        "planned_hours": "16.00",
        "actual_hours": "14.00",
        "operation_rate": "87.50",
        "includes_demo": True,
    }
    service.get_summary.assert_called_once_with(
        equipment_id=20,
        date_from=date(2026, 11, 18),
        date_to=date(2026, 11, 24),
    )


def test_operation_summary_returns_null_rate_and_rejects_reversed_period() -> None:
    service = MagicMock(spec=OperationService)
    service.get_summary.return_value = OperationSummary(
        planned_seconds=0,
        actual_seconds=0,
        rate=None,
        includes_demo=False,
    )
    application = make_operation_application(service)

    with TestClient(application) as client:
        empty = client.get("/api/v1/quality/operation")
        reversed_period = client.get(
            "/api/v1/quality/operation", params={"from": "2026-11-24", "to": "2026-11-20"}
        )
        zero_equipment = client.get("/api/v1/quality/operation", params={"equipment_id": 0})

    assert empty.status_code == 200
    assert empty.json()["operation_rate"] is None
    assert empty.json()["planned_hours"] == "0.00"
    assert empty.json()["from_date"] is None
    assert reversed_period.status_code == 422
    assert reversed_period.json()["code"] == "VALIDATION_ERROR"
    assert zero_equipment.status_code == 422
    assert service.get_summary.call_count == 1
