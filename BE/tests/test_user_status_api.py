from datetime import UTC, datetime, time
from unittest.mock import MagicMock

from app.core.config import Settings
from app.dependencies.auth import get_account_management_service, get_current_user
from app.main import create_app
from app.models.master import AppUser
from app.security.cookies import CSRF_HEADER_NAME
from app.security.passwords import hash_password
from app.services.account_management import (
    AccountAlreadyActiveError,
    AccountAlreadyInactiveError,
    AccountManagementService,
    LastAdminRequiredError,
    SelfDeactivationNotAllowedError,
    UserVersionConflictError,
)
from app.services.password_reset import UserNotFoundError
from fastapi import FastAPI
from fastapi.testclient import TestClient

TIMESTAMP = datetime(2026, 11, 23, 1, 0, tzinfo=UTC)


def make_settings() -> Settings:
    return Settings(
        _env_file=None,
        database_url="postgresql+psycopg://user:password@localhost/database",
        jwt_secret="test-secret-that-is-at-least-32-characters",
    )


def make_user(user_id: int = 1, *, deleted: bool = False, version: int = 3) -> AppUser:
    return AppUser(
        id=user_id,
        employee_no=f"E{user_id:03d}",
        display_name="테스트 사용자",
        password_hash=hash_password("old-password"),
        role="admin" if user_id == 1 else "worker",
        must_change_password=False,
        shift_start_local=time(9, 0),
        shift_end_local=time(18, 0),
        failed_login_count=0,
        locked_until=None,
        version=version,
        created_at=TIMESTAMP,
        updated_at=TIMESTAMP,
        deleted_at=TIMESTAMP if deleted else None,
    )


def make_application() -> tuple[FastAPI, Settings]:
    settings = make_settings()
    return create_app(settings=settings, migration_checker=lambda engine, path: None), settings


def with_csrf(client: TestClient, settings: Settings) -> dict[str, str]:
    client.cookies.set(settings.csrf_cookie_name, "csrf-token")
    return {CSRF_HEADER_NAME: "csrf-token"}


def status_service(
    user: AppUser | None = None, error: Exception | type[Exception] | None = None
) -> MagicMock:
    service = MagicMock(spec=AccountManagementService)
    if error is not None:
        service.deactivate_user.side_effect = error
        service.reactivate_user.side_effect = error
    else:
        service.deactivate_user.return_value = user
        service.reactivate_user.return_value = user
    return service


def test_admin_deactivates_and_reactivates_user() -> None:
    application, settings = make_application()
    application.dependency_overrides[get_current_user] = lambda: make_user()
    deactivated = make_user(user_id=2, deleted=True, version=4)

    deactivation_service = status_service(deactivated)
    reactivation_service = status_service(make_user(user_id=2, version=5))
    application.dependency_overrides[get_account_management_service] = lambda: deactivation_service

    with TestClient(application) as client:
        headers = with_csrf(client, settings)
        deactivation = client.post(
            "/api/v1/users/2/deactivation", json={"version": 3}, headers=headers
        )

        application.dependency_overrides[get_account_management_service] = (
            lambda: reactivation_service
        )
        reactivation = client.post(
            "/api/v1/users/2/reactivation", json={"version": 4}, headers=headers
        )

    assert deactivation.status_code == 200
    assert deactivation.json()["is_active"] is False
    assert deactivation.headers["cache-control"] == "no-store"
    actor, user_id, version = deactivation_service.deactivate_user.call_args.args
    assert actor.id == 1
    assert user_id == 2
    assert version == 3

    assert reactivation.status_code == 200
    assert reactivation.json()["is_active"] is True
    assert reactivation.headers["cache-control"] == "no-store"
    reactivate_args = reactivation_service.reactivate_user.call_args.args
    assert reactivate_args[0].id == 1
    assert reactivate_args[1:] == (2, 4)


def test_deactivation_maps_domain_errors() -> None:
    application, settings = make_application()
    application.dependency_overrides[get_current_user] = lambda: make_user()

    with TestClient(application) as client:
        headers = with_csrf(client, settings)
        cases = [
            (UserNotFoundError, 404, "USER_NOT_FOUND"),
            (UserVersionConflictError(4), 409, "VERSION_CONFLICT"),
            (AccountAlreadyInactiveError, 409, "ACCOUNT_ALREADY_INACTIVE"),
            (SelfDeactivationNotAllowedError, 403, "SELF_DEACTIVATION_NOT_ALLOWED"),
            (LastAdminRequiredError, 409, "LAST_ADMIN_REQUIRED"),
        ]
        for error, expected_status, expected_code in cases:
            application.dependency_overrides[get_account_management_service] = lambda e=error: (
                status_service(error=e)
            )
            response = client.post(
                "/api/v1/users/2/deactivation", json={"version": 1}, headers=headers
            )
            assert response.status_code == expected_status
            assert response.json()["code"] == expected_code


def test_reactivation_maps_domain_errors() -> None:
    application, settings = make_application()
    application.dependency_overrides[get_current_user] = lambda: make_user()

    with TestClient(application) as client:
        headers = with_csrf(client, settings)
        cases = [
            (UserNotFoundError, 404, "USER_NOT_FOUND"),
            (AccountAlreadyActiveError, 409, "ACCOUNT_ALREADY_ACTIVE"),
        ]
        for error, expected_status, expected_code in cases:
            application.dependency_overrides[get_account_management_service] = lambda e=error: (
                status_service(error=e)
            )
            response = client.post(
                "/api/v1/users/2/reactivation", json={"version": 1}, headers=headers
            )
            assert response.status_code == expected_status
            assert response.json()["code"] == expected_code


def test_status_change_requires_admin_and_csrf() -> None:
    service = status_service(make_user(user_id=2))
    application, settings = make_application()
    application.dependency_overrides[get_current_user] = lambda: make_user(user_id=9)
    application.dependency_overrides[get_account_management_service] = lambda: service

    with TestClient(application) as client:
        missing_csrf = client.post("/api/v1/users/2/deactivation", json={"version": 1})
        headers = with_csrf(client, settings)
        forbidden = client.post(
            "/api/v1/users/2/deactivation", json={"version": 1}, headers=headers
        )

    assert missing_csrf.status_code == 403
    assert missing_csrf.json()["code"] == "CSRF_VALIDATION_FAILED"
    assert forbidden.status_code == 403
    assert forbidden.json()["code"] == "FORBIDDEN"
    service.deactivate_user.assert_not_called()


def test_status_change_validates_version() -> None:
    service = status_service(make_user(user_id=2))
    application, settings = make_application()
    application.dependency_overrides[get_current_user] = lambda: make_user()
    application.dependency_overrides[get_account_management_service] = lambda: service

    with TestClient(application) as client:
        headers = with_csrf(client, settings)
        response = client.post("/api/v1/users/2/deactivation", json={"version": 0}, headers=headers)

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"
    service.deactivate_user.assert_not_called()
