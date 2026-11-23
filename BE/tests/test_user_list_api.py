from datetime import UTC, datetime, time
from unittest.mock import MagicMock

from app.core.config import Settings
from app.dependencies.auth import get_account_management_service, get_current_user
from app.main import create_app
from app.models.master import AppUser
from app.security.passwords import hash_password
from app.services.account_management import AccountManagementService, UserListResult
from fastapi import FastAPI
from fastapi.testclient import TestClient


def make_settings() -> Settings:
    return Settings(
        _env_file=None,
        database_url="postgresql+psycopg://user:password@localhost/database",
        jwt_secret="test-secret-that-is-at-least-32-characters",
    )


def make_user(user_id: int = 1, role: str = "admin", *, deleted: bool = False) -> AppUser:
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
        deleted_at=datetime.now(UTC) if deleted else None,
    )


def make_application() -> tuple[FastAPI, Settings]:
    settings = make_settings()
    return create_app(settings=settings, migration_checker=lambda engine, path: None), settings


def test_admin_lists_users_with_pagination() -> None:
    workers = [make_user(user_id=2, role="worker"), make_user(user_id=3, role="worker")]
    service = MagicMock(spec=AccountManagementService)
    service.list_users.return_value = UserListResult(users=workers, total_items=12)
    application, _ = make_application()
    application.dependency_overrides[get_current_user] = lambda: make_user()
    application.dependency_overrides[get_account_management_service] = lambda: service

    with TestClient(application) as client:
        response = client.get("/api/v1/users?page=2&page_size=10&q=%20%20&role=worker")

    assert response.status_code == 200
    body = response.json()
    assert [item["user_id"] for item in body["items"]] == [2, 3]
    assert body["items"][0] == {
        "user_id": 2,
        "employee_no": "E002",
        "display_name": "테스트 사용자",
        "role": "worker",
        "is_active": True,
        "shift_start_local": "09:00:00",
        "shift_end_local": "18:00:00",
        "version": 1,
    }
    assert body["pagination"] == {
        "page": 2,
        "page_size": 10,
        "total_items": 12,
        "total_pages": 2,
    }
    service.list_users.assert_called_once_with(
        query="  ",
        role="worker",
        include_inactive=False,
        page=2,
        page_size=10,
    )


def test_user_list_marks_inactive_accounts_and_empty_page() -> None:
    service = MagicMock(spec=AccountManagementService)
    service.list_users.return_value = UserListResult(
        users=[make_user(user_id=4, role="worker", deleted=True)], total_items=0
    )
    application, _ = make_application()
    application.dependency_overrides[get_current_user] = lambda: make_user()
    application.dependency_overrides[get_account_management_service] = lambda: service

    with TestClient(application) as client:
        response = client.get("/api/v1/users?include_inactive=true")

    assert response.status_code == 200
    body = response.json()
    assert body["items"][0]["is_active"] is False
    assert body["pagination"]["total_pages"] == 0


def test_user_list_requires_admin() -> None:
    service = MagicMock(spec=AccountManagementService)
    application, _ = make_application()
    application.dependency_overrides[get_current_user] = lambda: make_user(role="worker")
    application.dependency_overrides[get_account_management_service] = lambda: service

    with TestClient(application) as client:
        forbidden = client.get("/api/v1/users")

    assert forbidden.status_code == 403
    assert forbidden.json()["code"] == "FORBIDDEN"
    service.list_users.assert_not_called()


def test_user_list_requires_authentication() -> None:
    application, _ = make_application()

    with TestClient(application) as client:
        unauthenticated = client.get("/api/v1/users")

    assert unauthenticated.status_code == 401
    assert unauthenticated.json()["code"] == "AUTHENTICATION_REQUIRED"


def test_user_list_rejects_invalid_paging() -> None:
    service = MagicMock(spec=AccountManagementService)
    application, _ = make_application()
    application.dependency_overrides[get_current_user] = lambda: make_user()
    application.dependency_overrides[get_account_management_service] = lambda: service

    with TestClient(application) as client:
        invalid = client.get("/api/v1/users?page=0&page_size=101")

    assert invalid.status_code == 422
    assert invalid.json()["code"] == "VALIDATION_ERROR"
    service.list_users.assert_not_called()
