from datetime import UTC, datetime, time
from unittest.mock import MagicMock

from app.core.config import Settings
from app.dependencies.auth import get_account_management_service, get_current_user
from app.main import create_app
from app.models.master import AppUser
from app.security.passwords import hash_password
from app.services.account_management import AccountManagementService
from app.services.password_reset import UserNotFoundError
from fastapi import FastAPI
from fastapi.testclient import TestClient

CREATED_AT = datetime(2026, 11, 20, 1, 0, tzinfo=UTC)
UPDATED_AT = datetime(2026, 11, 23, 1, 0, tzinfo=UTC)


def make_settings() -> Settings:
    return Settings(
        _env_file=None,
        database_url="postgresql+psycopg://user:password@localhost/database",
        jwt_secret="test-secret-that-is-at-least-32-characters",
    )


def make_user(user_id: int = 2, role: str = "worker", *, deleted: bool = False) -> AppUser:
    return AppUser(
        id=user_id,
        employee_no=f"E{user_id:03d}",
        display_name="고용자",
        password_hash=hash_password("old-password"),
        role=role,
        must_change_password=True,
        shift_start_local=time(9, 0),
        shift_end_local=time(18, 0),
        failed_login_count=0,
        locked_until=None,
        version=3,
        created_at=CREATED_AT,
        updated_at=UPDATED_AT,
        deleted_at=UPDATED_AT if deleted else None,
    )


def make_application() -> tuple[FastAPI, Settings]:
    settings = make_settings()
    return create_app(settings=settings, migration_checker=lambda engine, path: None), settings


def test_admin_reads_active_user_detail() -> None:
    service = MagicMock(spec=AccountManagementService)
    service.get_user.return_value = make_user()
    application, _ = make_application()
    application.dependency_overrides[get_current_user] = lambda: make_user(user_id=1, role="admin")
    application.dependency_overrides[get_account_management_service] = lambda: service

    with TestClient(application) as client:
        response = client.get("/api/v1/users/2")

    assert response.status_code == 200
    assert response.json() == {
        "user_id": 2,
        "employee_no": "E002",
        "display_name": "고용자",
        "role": "worker",
        "is_active": True,
        "shift_start_local": "09:00:00",
        "shift_end_local": "18:00:00",
        "must_change_password": True,
        "version": 3,
        "created_at": "2026-11-20T01:00:00Z",
        "updated_at": "2026-11-23T01:00:00Z",
        "deactivated_at": None,
    }
    service.get_user.assert_called_once_with(2)


def test_admin_reads_deactivated_user_detail() -> None:
    service = MagicMock(spec=AccountManagementService)
    service.get_user.return_value = make_user(deleted=True)
    application, _ = make_application()
    application.dependency_overrides[get_current_user] = lambda: make_user(user_id=1, role="admin")
    application.dependency_overrides[get_account_management_service] = lambda: service

    with TestClient(application) as client:
        response = client.get("/api/v1/users/2")

    assert response.status_code == 200
    assert response.json()["is_active"] is False
    assert response.json()["deactivated_at"] == "2026-11-23T01:00:00Z"


def test_user_detail_returns_not_found() -> None:
    service = MagicMock(spec=AccountManagementService)
    service.get_user.side_effect = UserNotFoundError
    application, _ = make_application()
    application.dependency_overrides[get_current_user] = lambda: make_user(user_id=1, role="admin")
    application.dependency_overrides[get_account_management_service] = lambda: service

    with TestClient(application) as client:
        response = client.get("/api/v1/users/999")

    assert response.status_code == 404
    assert response.json()["code"] == "USER_NOT_FOUND"
    assert "request_id" in response.json()


def test_user_detail_requires_admin() -> None:
    service = MagicMock(spec=AccountManagementService)
    application, _ = make_application()
    application.dependency_overrides[get_current_user] = lambda: make_user(role="worker")
    application.dependency_overrides[get_account_management_service] = lambda: service

    with TestClient(application) as client:
        response = client.get("/api/v1/users/2")

    assert response.status_code == 403
    assert response.json()["code"] == "FORBIDDEN"
    service.get_user.assert_not_called()
