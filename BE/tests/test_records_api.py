from datetime import UTC, date, datetime, time
from decimal import Decimal
from unittest.mock import MagicMock

from app.core.config import Settings
from app.dependencies.auth import get_current_user
from app.main import create_app
from app.models.master import AppUser, Equipment, Product
from app.models.process import InspectionRecord, ProcessRecord
from app.repositories.record_history import InspectionRecordView, ProcessRecordView
from app.routers.records import get_record_history_service
from app.services.record_history import (
    InspectionRecordPage,
    ProcessRecordPage,
    RecordHistoryService,
    RecordNotFoundError,
)
from fastapi import FastAPI
from fastapi.testclient import TestClient

NOW = datetime(2026, 11, 20, 3, 0, tzinfo=UTC)


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
        display_name="테스트 사용자",
        password_hash="unused",
        role=role,
        must_change_password=False,
        shift_start_local=time(9, 0),
        shift_end_local=time(18, 0),
        failed_login_count=0,
        version=1,
    )


def make_view(record_id: int = 1) -> ProcessRecordView:
    equipment = Equipment(id=20, equipment_code="S01", name="사출기 1")
    product = Product(id=30, product_code=None, name="시연 제품")
    record = ProcessRecord(
        id=record_id,
        source_import_id=10,
        source_row_number=4,
        equipment_id=20,
        product_id=30,
        occurred_at=NOW,
        available_at=NOW,
        cycle_time_seconds=Decimal("12.345"),
        source_namespace="test",
        source_record_key=f"row-{record_id}",
        source_payload={"_id": f"row-{record_id}"},
        is_demo=True,
        version=1,
    )
    return ProcessRecordView(record=record, equipment=equipment, product=product)


def make_application(service: RecordHistoryService | None = None) -> FastAPI:
    application = create_app(
        settings=make_settings(),
        migration_checker=lambda engine, path: None,
    )
    application.dependency_overrides[get_current_user] = make_user
    if service is not None:
        application.dependency_overrides[get_record_history_service] = lambda: service
    return application


def make_inspection_view(record_id: int = 1) -> InspectionRecordView:
    equipment = Equipment(id=20, equipment_code="S01", name="사출기 1")
    product = Product(id=30, product_code=None, name="시연 제품")
    record = InspectionRecord(
        id=record_id,
        equipment_id=20,
        product_id=30,
        process_record_id=5,
        inspected_at=NOW,
        available_at=NOW,
        verdict="defect",
        defect_type="scratch",
        reason="표면 긁힘",
        is_demo=True,
        version=1,
    )
    return InspectionRecordView(record=record, equipment=equipment, product=product)


def test_worker_lists_inspection_records_with_verdict_filter() -> None:
    service = MagicMock(spec=RecordHistoryService)
    service.list_inspection_records.return_value = InspectionRecordPage(
        records=[make_inspection_view()], total_items=1
    )

    with TestClient(make_application(service)) as client:
        response = client.get(
            "/api/v1/inspection-records",
            params={"verdict": "defect", "equipment_id": 20},
        )

    assert response.status_code == 200
    assert response.json() == {
        "items": [
            {
                "record_id": 1,
                "equipment_id": 20,
                "equipment_code": "S01",
                "equipment_name": "사출기 1",
                "product_id": 30,
                "product_code": None,
                "product_name": "시연 제품",
                "process_record_id": 5,
                "inspected_at": "2026-11-20T03:00:00Z",
                "available_at": "2026-11-20T03:00:00Z",
                "verdict": "defect",
                "defect_type": "scratch",
                "reason": "표면 긁힘",
                "inspected_quantity": None,
                "good_quantity": None,
                "defect_quantity": None,
                "inspector_id": None,
                "is_demo": True,
                "version": 1,
            }
        ],
        "pagination": {"page": 1, "page_size": 10, "total_items": 1, "total_pages": 1},
    }
    service.list_inspection_records.assert_called_once_with(
        equipment_id=20,
        product_id=None,
        verdict="defect",
        date_from=None,
        date_to=None,
        page=1,
        page_size=10,
    )


def test_inspection_record_detail_and_not_found() -> None:
    service = MagicMock(spec=RecordHistoryService)
    service.get_inspection_record.return_value = make_inspection_view(record_id=7)

    with TestClient(make_application(service)) as client:
        found = client.get("/api/v1/inspection-records/7")

    assert found.status_code == 200
    assert found.json()["record_id"] == 7

    service.get_inspection_record.side_effect = RecordNotFoundError
    with TestClient(make_application(service)) as client:
        missing = client.get("/api/v1/inspection-records/999")

    assert missing.status_code == 404
    assert missing.json()["code"] == "RECORD_NOT_FOUND"


def test_inspection_records_reject_invalid_verdict_and_period() -> None:
    service = MagicMock(spec=RecordHistoryService)

    with TestClient(make_application(service)) as client:
        bad_verdict = client.get("/api/v1/inspection-records", params={"verdict": "ng"})
        reversed_period = client.get(
            "/api/v1/inspection-records",
            params={"from": "2026-11-21", "to": "2026-11-20"},
        )

    assert bad_verdict.status_code == 422
    assert reversed_period.status_code == 422
    service.list_inspection_records.assert_not_called()


def test_process_records_require_authentication() -> None:
    application = create_app(
        settings=make_settings(),
        migration_checker=lambda engine, path: None,
    )

    with TestClient(application) as client:
        response = client.get("/api/v1/process-records")

    assert response.status_code == 401
    assert response.json()["code"] == "AUTHENTICATION_REQUIRED"


def test_worker_lists_process_records_with_filters() -> None:
    service = MagicMock(spec=RecordHistoryService)
    service.list_process_records.return_value = ProcessRecordPage(
        records=[make_view()], total_items=1
    )

    with TestClient(make_application(service)) as client:
        response = client.get(
            "/api/v1/process-records",
            params={
                "equipment_id": 20,
                "from": "2026-11-20",
                "to": "2026-11-20",
                "page": 2,
                "page_size": 10,
            },
        )

    assert response.status_code == 200
    assert response.json() == {
        "items": [
            {
                "record_id": 1,
                "equipment_id": 20,
                "equipment_code": "S01",
                "equipment_name": "사출기 1",
                "product_id": 30,
                "product_code": None,
                "product_name": "시연 제품",
                "occurred_at": "2026-11-20T03:00:00Z",
                "available_at": "2026-11-20T03:00:00Z",
                "cycle_time_seconds": "12.345",
                "is_demo": True,
                "version": 1,
            }
        ],
        "pagination": {"page": 2, "page_size": 10, "total_items": 1, "total_pages": 1},
    }
    service.list_process_records.assert_called_once_with(
        equipment_id=20,
        product_id=None,
        date_from=date(2026, 11, 20),
        date_to=date(2026, 11, 20),
        page=2,
        page_size=10,
    )


def test_process_record_detail_includes_source_fields() -> None:
    service = MagicMock(spec=RecordHistoryService)
    service.get_process_record.return_value = make_view(record_id=7)

    with TestClient(make_application(service)) as client:
        response = client.get("/api/v1/process-records/7")

    assert response.status_code == 200
    body = response.json()
    assert body["record_id"] == 7
    assert body["source_import_id"] == 10
    assert body["source_row_number"] == 4
    assert body["produced_quantity"] is None
    service.get_process_record.assert_called_once_with(7)


def test_process_record_detail_returns_not_found() -> None:
    service = MagicMock(spec=RecordHistoryService)
    service.get_process_record.side_effect = RecordNotFoundError

    with TestClient(make_application(service)) as client:
        response = client.get("/api/v1/process-records/999")

    assert response.status_code == 404
    assert response.json()["code"] == "RECORD_NOT_FOUND"
    assert "request_id" in response.json()


def test_process_records_reject_invalid_filters() -> None:
    service = MagicMock(spec=RecordHistoryService)

    with TestClient(make_application(service)) as client:
        reversed_period = client.get(
            "/api/v1/process-records",
            params={"from": "2026-11-21", "to": "2026-11-20"},
        )
        zero_equipment = client.get("/api/v1/process-records", params={"equipment_id": 0})
        large_page = client.get("/api/v1/process-records", params={"page_size": 101})

    assert reversed_period.status_code == 422
    assert reversed_period.json()["code"] == "VALIDATION_ERROR"
    assert zero_equipment.status_code == 422
    assert large_page.status_code == 422
    service.list_process_records.assert_not_called()
