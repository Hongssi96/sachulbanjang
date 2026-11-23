from datetime import time
from unittest.mock import MagicMock

from app.core.config import Settings
from app.dependencies.auth import (
    get_current_user,
    get_password_reset_service,
)
from app.main import create_app
from app.models.master import AppUser
from app.security.cookies import CSRF_HEADER_NAME
from app.security.passwords import hash_password
from app.services.password_reset import (
    PasswordResetResult,
    PasswordResetService,
    SelfPasswordResetNotAllowedError,
    UserNotFoundError,
)
from fastapi import FastAPI
from fastapi.testclient import TestClient


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
    application = create_app(
        settings=settings,
        migration_checker=lambda engine, path: None,
    )
    return application, settings


def with_csrf(client: TestClient, settings: Settings) -> dict[str, str]:
    client.cookies.set(settings.csrf_cookie_name, "csrf-token")
    return {CSRF_HEADER_NAME: "csrf-token"}


def reset_service() -> MagicMock:
    return MagicMock(spec=PasswordResetService)


def test_password_reset_returns_temporary_password_once_to_admin() -> None:
    target = make_user(user_id=2, role="worker")
    target.must_change_password = True
    target.version = 4
    actor = make_user(user_id=1, role="admin")
    service = reset_service()
    service.reset_password.return_value = PasswordResetResult(
        user=target, temporary_password="TempPass12345678"
    )
    application, settings = make_application()
    application.dependency_overrides[get_current_user] = lambda: actor
    application.dependency_overrides[get_password_reset_service] = lambda: service

    with TestClient(application) as client:
        headers = with_csrf(client, settings)
        response = client.post("/api/v1/users/2/password-reset", headers=headers)

    assert response.status_code == 200
    assert response.json() == {
        "user_id": 2,
        "employee_no": "E002",
        "temporary_password": "TempPass12345678",
        "must_change_password": True,
        "version": 4,
    }
    assert response.headers["cache-control"] == "no-store"
    service.reset_password.assert_called_once_with(actor, 2)


def test_password_reset_rejects_non_admin_user() -> None:
    service = reset_service()
    application, settings = make_application()
    application.dependency_overrides[get_current_user] = lambda: make_user(role="worker")
    application.dependency_overrides[get_password_reset_service] = lambda: service

    with TestClient(application) as client:
        headers = with_csrf(client, settings)
        response = client.post("/api/v1/users/2/password-reset", headers=headers)

    assert response.status_code == 403
    assert response.json()["code"] == "FORBIDDEN"
    service.reset_password.assert_not_called()


def test_password_reset_rejects_the_administrators_own_account() -> None:
    actor = make_user(user_id=1, role="admin")
    service = reset_service()
    service.reset_password.side_effect = SelfPasswordResetNotAllowedError
    application, settings = make_application()
    application.dependency_overrides[get_current_user] = lambda: actor
    application.dependency_overrides[get_password_reset_service] = lambda: service

    with TestClient(application) as client:
        headers = with_csrf(client, settings)
        response = client.post("/api/v1/users/1/password-reset", headers=headers)

    assert response.status_code == 403
    assert response.json()["code"] == "SELF_PASSWORD_RESET_NOT_ALLOWED"


def test_password_reset_returns_not_found_for_missing_or_deleted_user() -> None:
    service = reset_service()
    service.reset_password.side_effect = UserNotFoundError
    application, settings = make_application()
    application.dependency_overrides[get_current_user] = lambda: make_user()
    application.dependency_overrides[get_password_reset_service] = lambda: service

    with TestClient(application) as client:
        headers = with_csrf(client, settings)
        response = client.post("/api/v1/users/999/password-reset", headers=headers)

    assert response.status_code == 404
    assert response.json()["code"] == "USER_NOT_FOUND"
    assert "request_id" in response.json()


def test_password_reset_requires_authentication_and_csrf() -> None:
    application, settings = make_application()

    with TestClient(application) as client:
        missing_csrf = client.post("/api/v1/users/2/password-reset")
        headers = with_csrf(client, settings)
        missing_auth = client.post("/api/v1/users/2/password-reset", headers=headers)

    assert missing_csrf.status_code == 403
    assert missing_csrf.json()["code"] == "CSRF_VALIDATION_FAILED"
    assert missing_auth.status_code == 401
    assert missing_auth.json()["code"] == "AUTHENTICATION_REQUIRED"


def test_password_reset_rejects_invalid_user_id() -> None:
    service = reset_service()
    application, settings = make_application()
    application.dependency_overrides[get_current_user] = lambda: make_user()
    application.dependency_overrides[get_password_reset_service] = lambda: service

    with TestClient(application) as client:
        headers = with_csrf(client, settings)
        response = client.post("/api/v1/users/0/password-reset", headers=headers)

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"
    service.reset_password.assert_not_called()
