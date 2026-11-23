from datetime import time
from unittest.mock import MagicMock

from app.core.config import Settings
from app.dependencies.auth import get_account_management_service, get_current_user
from app.main import create_app
from app.models.master import AppUser
from app.security.cookies import CSRF_HEADER_NAME
from app.security.passwords import hash_password
from app.services.account_management import (
    AccountManagementService,
    CreateUserResult,
    EmployeeNumberAlreadyExistsError,
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
    return create_app(settings=settings, migration_checker=lambda engine, path: None), settings


def valid_payload() -> dict[str, str]:
    return {
        "employee_no": " E200 ",
        "display_name": " 신규 고용자 ",
        "role": "worker",
        "shift_start_local": "09:00:00",
        "shift_end_local": "18:00:00",
    }


def test_admin_creates_user_and_receives_temporary_password_once() -> None:
    created = make_user(user_id=2, role="worker")
    created.employee_no = "E200"
    created.display_name = "신규 고용자"
    created.must_change_password = True
    service = MagicMock(spec=AccountManagementService)
    service.create_user.return_value = CreateUserResult(
        user=created, temporary_password="TempPass12345678"
    )
    application, settings = make_application()
    application.dependency_overrides[get_current_user] = lambda: make_user()
    application.dependency_overrides[get_account_management_service] = lambda: service

    with TestClient(application) as client:
        client.cookies.set(settings.csrf_cookie_name, "csrf-token")
        response = client.post(
            "/api/v1/users",
            json=valid_payload(),
            headers={CSRF_HEADER_NAME: "csrf-token"},
        )

    assert response.status_code == 201
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == {
        "user_id": 2,
        "employee_no": "E200",
        "display_name": "신규 고용자",
        "role": "worker",
        "shift_start_local": "09:00:00",
        "shift_end_local": "18:00:00",
        "temporary_password": "TempPass12345678",
        "must_change_password": True,
        "version": 1,
    }
    command = service.create_user.call_args.args[0]
    assert command.employee_no == "E200"
    assert command.display_name == "신규 고용자"


def test_create_user_rejects_duplicate_employee_number() -> None:
    service = MagicMock(spec=AccountManagementService)
    service.create_user.side_effect = EmployeeNumberAlreadyExistsError
    application, settings = make_application()
    application.dependency_overrides[get_current_user] = lambda: make_user()
    application.dependency_overrides[get_account_management_service] = lambda: service

    with TestClient(application) as client:
        client.cookies.set(settings.csrf_cookie_name, "csrf-token")
        response = client.post(
            "/api/v1/users",
            json=valid_payload(),
            headers={CSRF_HEADER_NAME: "csrf-token"},
        )

    assert response.status_code == 409
    assert response.json()["code"] == "EMPLOYEE_NO_ALREADY_EXISTS"


def test_create_user_requires_admin_and_csrf() -> None:
    service = MagicMock(spec=AccountManagementService)
    application, settings = make_application()
    application.dependency_overrides[get_current_user] = lambda: make_user(role="worker")
    application.dependency_overrides[get_account_management_service] = lambda: service

    with TestClient(application) as client:
        missing_csrf = client.post("/api/v1/users", json=valid_payload())
        client.cookies.set(settings.csrf_cookie_name, "csrf-token")
        forbidden = client.post(
            "/api/v1/users",
            json=valid_payload(),
            headers={CSRF_HEADER_NAME: "csrf-token"},
        )

    assert missing_csrf.status_code == 403
    assert missing_csrf.json()["code"] == "CSRF_VALIDATION_FAILED"
    assert forbidden.status_code == 403
    assert forbidden.json()["code"] == "FORBIDDEN"
    service.create_user.assert_not_called()


def test_create_user_validates_role_and_blank_identifiers() -> None:
    service = MagicMock(spec=AccountManagementService)
    application, settings = make_application()
    application.dependency_overrides[get_current_user] = lambda: make_user()
    application.dependency_overrides[get_account_management_service] = lambda: service
    payload = valid_payload()
    payload["employee_no"] = "   "
    payload["role"] = "owner"

    with TestClient(application) as client:
        client.cookies.set(settings.csrf_cookie_name, "csrf-token")
        response = client.post(
            "/api/v1/users",
            json=payload,
            headers={CSRF_HEADER_NAME: "csrf-token"},
        )

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"
    service.create_user.assert_not_called()
