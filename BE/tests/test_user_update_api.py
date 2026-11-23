from datetime import UTC, datetime, time
from unittest.mock import MagicMock

from app.core.config import Settings
from app.dependencies.auth import get_account_management_service, get_current_user
from app.main import create_app
from app.models.master import AppUser
from app.security.cookies import CSRF_HEADER_NAME
from app.security.passwords import hash_password
from app.services.account_management import (
    AccountManagementService,
    LastAdminRequiredError,
    SelfRoleChangeNotAllowedError,
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
        version=2,
        created_at=TIMESTAMP,
        updated_at=TIMESTAMP,
    )


def make_application() -> tuple[FastAPI, Settings]:
    settings = make_settings()
    return create_app(settings=settings, migration_checker=lambda engine, path: None), settings


def with_csrf(client: TestClient, settings: Settings) -> dict[str, str]:
    client.cookies.set(settings.csrf_cookie_name, "csrf-token")
    return {CSRF_HEADER_NAME: "csrf-token"}


def update_service(
    user: AppUser | None = None, error: Exception | type[Exception] | None = None
) -> MagicMock:
    service = MagicMock(spec=AccountManagementService)
    if error is not None:
        service.update_user.side_effect = error
    else:
        service.update_user.return_value = user
    return service


def test_admin_updates_user_name_role_and_shift() -> None:
    updated = make_user(role="worker")
    updated.display_name = "새 이름"
    updated.shift_start_local = time(8, 30)
    updated.version = 3
    service = update_service(updated)
    application, settings = make_application()
    application.dependency_overrides[get_current_user] = lambda: make_user()
    application.dependency_overrides[get_account_management_service] = lambda: service

    with TestClient(application) as client:
        headers = with_csrf(client, settings)
        response = client.patch(
            "/api/v1/users/2",
            json={
                "version": 2,
                "display_name": " 새 이름 ",
                "role": "worker",
                "shift_start_local": "08:30:00",
            },
            headers=headers,
        )

    assert response.status_code == 200
    body = response.json()
    assert body["display_name"] == "새 이름"
    assert body["shift_start_local"] == "08:30:00"
    assert body["version"] == 3
    assert response.headers["cache-control"] == "no-store"
    actor, user_id, command = service.update_user.call_args.args
    assert actor.role == "admin"
    assert user_id == 2
    assert command.version == 2
    assert command.display_name == "새 이름"


def test_update_user_maps_domain_errors() -> None:
    application, settings = make_application()
    application.dependency_overrides[get_current_user] = lambda: make_user()

    with TestClient(application) as client:
        headers = with_csrf(client, settings)

        application.dependency_overrides[get_account_management_service] = lambda: update_service(
            error=UserNotFoundError
        )
        not_found = client.patch(
            "/api/v1/users/2", json={"version": 1, "display_name": "이름"}, headers=headers
        )

        application.dependency_overrides[get_account_management_service] = lambda: update_service(
            error=UserVersionConflictError(3)
        )
        conflict = client.patch(
            "/api/v1/users/2", json={"version": 1, "display_name": "이름"}, headers=headers
        )

        application.dependency_overrides[get_account_management_service] = lambda: update_service(
            error=SelfRoleChangeNotAllowedError
        )
        self_change = client.patch(
            "/api/v1/users/2", json={"version": 1, "role": "worker"}, headers=headers
        )

        application.dependency_overrides[get_account_management_service] = lambda: update_service(
            error=LastAdminRequiredError
        )
        last_admin = client.patch(
            "/api/v1/users/2", json={"version": 1, "role": "worker"}, headers=headers
        )

    assert not_found.status_code == 404
    assert not_found.json()["code"] == "USER_NOT_FOUND"
    assert conflict.status_code == 409
    assert conflict.json()["code"] == "VERSION_CONFLICT"
    assert self_change.status_code == 403
    assert self_change.json()["code"] == "SELF_ROLE_CHANGE_NOT_ALLOWED"
    assert last_admin.status_code == 409
    assert last_admin.json()["code"] == "LAST_ADMIN_REQUIRED"


def test_update_user_requires_admin_and_csrf() -> None:
    service = update_service(make_user())
    application, settings = make_application()
    application.dependency_overrides[get_current_user] = lambda: make_user(role="worker")
    application.dependency_overrides[get_account_management_service] = lambda: service

    with TestClient(application) as client:
        missing_csrf = client.patch("/api/v1/users/2", json={"version": 1, "display_name": "이름"})
        headers = with_csrf(client, settings)
        forbidden = client.patch(
            "/api/v1/users/2", json={"version": 1, "display_name": "이름"}, headers=headers
        )

    assert missing_csrf.status_code == 403
    assert missing_csrf.json()["code"] == "CSRF_VALIDATION_FAILED"
    assert forbidden.status_code == 403
    assert forbidden.json()["code"] == "FORBIDDEN"
    service.update_user.assert_not_called()


def test_update_user_validates_payload() -> None:
    service = update_service(make_user())
    application, settings = make_application()
    application.dependency_overrides[get_current_user] = lambda: make_user()
    application.dependency_overrides[get_account_management_service] = lambda: service

    with TestClient(application) as client:
        headers = with_csrf(client, settings)
        blank = client.patch(
            "/api/v1/users/2", json={"version": 1, "display_name": "   "}, headers=headers
        )
        empty = client.patch("/api/v1/users/2", json={"version": 1}, headers=headers)
        bad_version = client.patch(
            "/api/v1/users/2", json={"version": 0, "display_name": "이름"}, headers=headers
        )

    assert blank.status_code == 422
    assert empty.status_code == 422
    assert bad_version.status_code == 422
    assert blank.json()["code"] == "VALIDATION_ERROR"
    service.update_user.assert_not_called()
