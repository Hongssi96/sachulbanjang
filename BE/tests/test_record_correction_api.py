from datetime import UTC, datetime, time
from decimal import Decimal
from unittest.mock import MagicMock

from app.core.config import Settings
from app.dependencies.auth import get_current_user
from app.main import create_app
from app.models.master import AppUser, Equipment, Product
from app.models.process import InspectionRecord, ProcessRecord, RecordChange
from app.repositories.record_correction import RecordChangeView
from app.repositories.record_history import InspectionRecordView, ProcessRecordView
from app.routers.records import get_record_correction_service
from app.services.record_correction import (
    NoRecordChangeError,
    RecordCorrectionService,
    RecordVersionConflictError,
)
from app.services.record_history import RecordNotFoundError
from fastapi import FastAPI
from fastapi.testclient import TestClient

NOW = datetime(2026, 11, 23, 4, 0, tzinfo=UTC)
OCCURRED = datetime(2026, 11, 20, 3, 0, tzinfo=UTC)


def make_settings() -> Settings:
    return Settings(
        _env_file=None,
        database_url="postgresql+psycopg://user:password@localhost/database",
        jwt_secret="test-secret-that-is-at-least-32-characters",
    )


def make_user(role: str = "admin") -> AppUser:
    return AppUser(
        id=9,
        employee_no="A9001",
        display_name="관리자",
        password_hash="unused",
        role=role,
        must_change_password=False,
        shift_start_local=time(9, 0),
        shift_end_local=time(18, 0),
        failed_login_count=0,
        version=1,
    )


def make_view(*, version: int = 2, cycle_time: Decimal = Decimal("11.000")) -> ProcessRecordView:
    equipment = Equipment(id=20, equipment_code="S01", name="사출기 1")
    product = Product(id=30, product_code="P-1", name="시연 제품")
    record = ProcessRecord(
        id=1,
        source_import_id=10,
        source_row_number=4,
        equipment_id=20,
        product_id=30,
        occurred_at=OCCURRED,
        available_at=OCCURRED,
        cycle_time_seconds=cycle_time,
        source_namespace="test",
        source_record_key="row-1",
        source_payload={"_id": "row-1"},
        is_demo=True,
        version=version,
    )
    return ProcessRecordView(record=record, equipment=equipment, product=product)


def make_application(service: RecordCorrectionService | None = None) -> FastAPI:
    application = create_app(
        settings=make_settings(),
        migration_checker=lambda engine, path: None,
    )
    application.dependency_overrides[get_current_user] = make_user
    if service is not None:
        application.dependency_overrides[get_record_correction_service] = lambda: service
    return application


def with_csrf(client: TestClient) -> dict[str, str]:
    settings = make_settings()
    client.cookies.set(settings.csrf_cookie_name, "csrf-token")
    return {"X-CSRF-Token": "csrf-token"}


def test_admin_corrects_process_record() -> None:
    service = MagicMock(spec=RecordCorrectionService)
    service.update_process_record.return_value = make_view()
    application = make_application(service)

    with TestClient(application) as client:
        headers = with_csrf(client)
        response = client.patch(
            "/api/v1/process-records/1",
            json={
                "version": 1,
                "change_reason": "사이클 시간 오입력 정정",
                "cycle_time_seconds": "11.000",
            },
            headers=headers,
        )

    assert response.status_code == 200
    body = response.json()
    assert body["record_id"] == 1
    assert body["cycle_time_seconds"] == "11.000"
    assert body["version"] == 2
    assert response.headers["cache-control"] == "no-store"
    actor, record_id = service.update_process_record.call_args.args
    assert actor.id == 9
    assert record_id == 1
    kwargs = service.update_process_record.call_args.kwargs
    assert kwargs["version"] == 1
    assert kwargs["change_reason"] == "사이클 시간 오입력 정정"
    assert kwargs["changes"] == {"cycle_time_seconds": Decimal("11.000")}


def test_correction_maps_domain_errors() -> None:
    application = make_application(MagicMock(spec=RecordCorrectionService))

    with TestClient(application) as client:
        headers = with_csrf(client)
        for error, expected_status, expected_code in [
            (RecordNotFoundError, 404, "RECORD_NOT_FOUND"),
            (RecordVersionConflictError(3), 409, "VERSION_CONFLICT"),
            (NoRecordChangeError, 422, "VALIDATION_ERROR"),
        ]:
            service = MagicMock(spec=RecordCorrectionService)
            service.update_process_record.side_effect = error
            application.dependency_overrides[get_record_correction_service] = lambda s=service: s
            response = client.patch(
                "/api/v1/process-records/1",
                json={"version": 1, "change_reason": "정정", "product_id": 30},
                headers=headers,
            )
            assert response.status_code == expected_status
            assert response.json()["code"] == expected_code


def test_correction_requires_admin_and_csrf() -> None:
    service = MagicMock(spec=RecordCorrectionService)
    application = create_app(settings=make_settings(), migration_checker=lambda engine, path: None)
    application.dependency_overrides[get_current_user] = lambda: make_user(role="worker")
    application.dependency_overrides[get_record_correction_service] = lambda: service

    with TestClient(application) as client:
        missing_csrf = client.patch(
            "/api/v1/process-records/1",
            json={"version": 1, "change_reason": "정정", "product_id": 30},
        )
        headers = with_csrf(client)
        forbidden = client.patch(
            "/api/v1/process-records/1",
            json={"version": 1, "change_reason": "정정", "product_id": 30},
            headers=headers,
        )

    assert missing_csrf.status_code == 403
    assert missing_csrf.json()["code"] == "CSRF_VALIDATION_FAILED"
    assert forbidden.status_code == 403
    assert forbidden.json()["code"] == "FORBIDDEN"
    service.update_process_record.assert_not_called()


def test_correction_validates_payload() -> None:
    service = MagicMock(spec=RecordCorrectionService)
    application = make_application(service)

    with TestClient(application) as client:
        headers = with_csrf(client)
        missing_reason = client.patch(
            "/api/v1/process-records/1", json={"version": 1, "product_id": 30}, headers=headers
        )
        blank_reason = client.patch(
            "/api/v1/process-records/1",
            json={"version": 1, "change_reason": "   ", "product_id": 30},
            headers=headers,
        )
        no_field = client.patch(
            "/api/v1/process-records/1",
            json={"version": 1, "change_reason": "정정"},
            headers=headers,
        )
        null_equipment = client.patch(
            "/api/v1/process-records/1",
            json={"version": 1, "change_reason": "정정", "equipment_id": None},
            headers=headers,
        )

    for response in (missing_reason, blank_reason, no_field, null_equipment):
        assert response.status_code == 422
        assert response.json()["code"] == "VALIDATION_ERROR"
    service.update_process_record.assert_not_called()


def test_admin_reads_record_changes() -> None:
    change = RecordChange(
        id=5,
        process_record_id=1,
        actor_id=9,
        operation="update",
        before_value={"cycle_time_seconds": "12.345"},
        after_value={"cycle_time_seconds": "11.000"},
        reason="정정",
        version=2,
        occurred_at=NOW,
    )
    service = MagicMock(spec=RecordCorrectionService)
    service.list_process_changes.return_value = [
        RecordChangeView(change=change, actor_display_name="관리자")
    ]
    application = make_application(service)

    with TestClient(application) as client:
        response = client.get("/api/v1/process-records/1/changes")

    assert response.status_code == 200
    assert response.json() == {
        "items": [
            {
                "change_id": 5,
                "operation": "update",
                "actor_id": 9,
                "actor_display_name": "관리자",
                "before_value": {"cycle_time_seconds": "12.345"},
                "after_value": {"cycle_time_seconds": "11.000"},
                "reason": "정정",
                "version": 2,
                "occurred_at": "2026-11-23T04:00:00Z",
            }
        ]
    }
    service.list_process_changes.assert_called_once_with(1)


def make_inspection_view(*, version: int = 2) -> InspectionRecordView:
    equipment = Equipment(id=20, equipment_code="S01", name="사출기 1")
    product = Product(id=30, product_code="P-1", name="시연 제품")
    record = InspectionRecord(
        id=1,
        equipment_id=20,
        product_id=30,
        process_record_id=5,
        inspected_at=OCCURRED,
        available_at=OCCURRED,
        verdict="good",
        defect_type=None,
        reason=None,
        is_demo=True,
        version=version,
    )
    return InspectionRecordView(record=record, equipment=equipment, product=product)


def test_admin_corrects_inspection_record() -> None:
    service = MagicMock(spec=RecordCorrectionService)
    service.update_inspection_record.return_value = make_inspection_view()
    application = make_application(service)

    with TestClient(application) as client:
        headers = with_csrf(client)
        response = client.patch(
            "/api/v1/inspection-records/1",
            json={"version": 1, "change_reason": "판정 정정", "verdict": "good"},
            headers=headers,
        )

    assert response.status_code == 200
    assert response.json()["verdict"] == "good"
    assert response.json()["version"] == 2
    assert response.headers["cache-control"] == "no-store"
    kwargs = service.update_inspection_record.call_args.kwargs
    assert kwargs["version"] == 1
    assert kwargs["change_reason"] == "판정 정정"
    assert kwargs["changes"] == {"verdict": "good"}


def test_inspection_correction_validates_payload() -> None:
    service = MagicMock(spec=RecordCorrectionService)
    application = make_application(service)

    with TestClient(application) as client:
        headers = with_csrf(client)
        missing_reason = client.patch(
            "/api/v1/inspection-records/1", json={"version": 1, "verdict": "good"}, headers=headers
        )
        no_field = client.patch(
            "/api/v1/inspection-records/1",
            json={"version": 1, "change_reason": "정정"},
            headers=headers,
        )
        null_verdict = client.patch(
            "/api/v1/inspection-records/1",
            json={"version": 1, "change_reason": "정정", "verdict": None},
            headers=headers,
        )

    for response in (missing_reason, no_field, null_verdict):
        assert response.status_code == 422
        assert response.json()["code"] == "VALIDATION_ERROR"
    service.update_inspection_record.assert_not_called()


def test_admin_reads_inspection_record_changes() -> None:
    change = RecordChange(
        id=6,
        inspection_record_id=1,
        actor_id=9,
        operation="update",
        before_value={"verdict": "defect"},
        after_value={"verdict": "good"},
        reason="판정 정정",
        version=2,
        occurred_at=NOW,
    )
    service = MagicMock(spec=RecordCorrectionService)
    service.list_inspection_changes.return_value = [
        RecordChangeView(change=change, actor_display_name="관리자")
    ]
    application = make_application(service)

    with TestClient(application) as client:
        response = client.get("/api/v1/inspection-records/1/changes")

    assert response.status_code == 200
    assert response.json()["items"][0]["change_id"] == 6
    service.list_inspection_changes.assert_called_once_with(1)


def test_record_changes_require_admin_and_existing_record() -> None:
    service = MagicMock(spec=RecordCorrectionService)
    service.list_process_changes.side_effect = RecordNotFoundError
    application = create_app(settings=make_settings(), migration_checker=lambda engine, path: None)
    application.dependency_overrides[get_current_user] = lambda: make_user(role="worker")
    application.dependency_overrides[get_record_correction_service] = lambda: service

    with TestClient(application) as client:
        forbidden = client.get("/api/v1/process-records/1/changes")

    assert forbidden.status_code == 403
    assert forbidden.json()["code"] == "FORBIDDEN"
    service.list_process_changes.assert_not_called()

    application.dependency_overrides[get_current_user] = lambda: make_user()
    with TestClient(application) as client:
        missing = client.get("/api/v1/process-records/999/changes")

    assert missing.status_code == 404
    assert missing.json()["code"] == "RECORD_NOT_FOUND"
