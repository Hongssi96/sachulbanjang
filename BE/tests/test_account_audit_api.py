from datetime import UTC, datetime, time
from unittest.mock import MagicMock

from app.core.config import Settings
from app.dependencies.auth import get_account_management_service, get_current_user
from app.main import create_app
from app.models.account_audit import AccountAuditEvent
from app.models.master import AppUser
from app.security.passwords import hash_password
from app.services.account_management import AccountManagementService, AuditEventListResult
from app.services.password_reset import UserNotFoundError
from fastapi import FastAPI
from fastapi.testclient import TestClient

CREATED_AT = datetime(2026, 11, 23, 2, 0, tzinfo=UTC)


def make_settings() -> Settings:
    return Settings(
        _env_file=None,
        database_url="postgresql+psycopg://user:password@localhost/database",
        jwt_secret="test-secret-that-is-at-least-32-characters",
    )


def make_user(user_id: int = 1, role: str = "admin") -> AppUser:
    return AppUser(
        id=user_id,
        employee_no=f"E{user_id:03d}",
        display_name="테스트 사용자",
        password_hash=hash_password("old-password"),
        role=role,
        must_change_password=False,
        shift_start_local=time(9, 0),
        shift_end_local=time(18, 0),
        failed_login_count=0,
        locked_until=None,
        version=1,
    )


def make_application() -> tuple[FastAPI, Settings]:
    settings = make_settings()
    return create_app(settings=settings, migration_checker=lambda engine, path: None), settings


def audit_service(
    result: AuditEventListResult | None = None, error: Exception | type[Exception] | None = None
) -> MagicMock:
    service = MagicMock(spec=AccountManagementService)
    if error is not None:
        service.list_audit_events.side_effect = error
    else:
        service.list_audit_events.return_value = result
    return service


def event() -> AccountAuditEvent:
    return AccountAuditEvent(
        id=11,
        user_id=2,
        actor_id=1,
        action="user_updated",
        detail={"changes": {"role": {"before": "worker", "after": "admin"}}},
        created_at=CREATED_AT,
    )


def test_admin_reads_audit_events() -> None:
    service = audit_service(AuditEventListResult(events=[(event(), "관리자")], total_items=1))
    application, _ = make_application()
    application.dependency_overrides[get_current_user] = lambda: make_user()
    application.dependency_overrides[get_account_management_service] = lambda: service

    with TestClient(application) as client:
        response = client.get("/api/v1/users/2/audit-events")

    assert response.status_code == 200
    assert response.json() == {
        "items": [
            {
                "event_id": 11,
                "action": "user_updated",
                "actor_id": 1,
                "actor_display_name": "관리자",
                "target_user_id": 2,
                "detail": {"changes": {"role": {"before": "worker", "after": "admin"}}},
                "created_at": "2026-11-23T02:00:00Z",
            }
        ],
        "pagination": {"page": 1, "page_size": 10, "total_items": 1, "total_pages": 1},
    }
    service.list_audit_events.assert_called_once_with(2, page=1, page_size=10)


def test_audit_events_return_not_found_for_unknown_target() -> None:
    service = audit_service(error=UserNotFoundError)
    application, _ = make_application()
    application.dependency_overrides[get_current_user] = lambda: make_user()
    application.dependency_overrides[get_account_management_service] = lambda: service

    with TestClient(application) as client:
        response = client.get("/api/v1/users/999/audit-events")

    assert response.status_code == 404
    assert response.json()["code"] == "USER_NOT_FOUND"


def test_audit_events_require_admin_and_validate_paging() -> None:
    service = audit_service(AuditEventListResult(events=[], total_items=0))
    application, _ = make_application()
    application.dependency_overrides[get_account_management_service] = lambda: service
    application.dependency_overrides[get_current_user] = lambda: make_user(role="worker")

    with TestClient(application) as client:
        forbidden = client.get("/api/v1/users/2/audit-events")

    assert forbidden.status_code == 403
    assert forbidden.json()["code"] == "FORBIDDEN"
    service.list_audit_events.assert_not_called()

    application.dependency_overrides[get_current_user] = lambda: make_user()
    with TestClient(application) as client:
        invalid = client.get("/api/v1/users/2/audit-events?page_size=0")

    assert invalid.status_code == 422
    assert invalid.json()["code"] == "VALIDATION_ERROR"
