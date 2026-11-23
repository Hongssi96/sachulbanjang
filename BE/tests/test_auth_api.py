from datetime import UTC, datetime, time, timedelta
from unittest.mock import MagicMock

import pytest
from app.core.config import Settings
from app.dependencies.auth import (
    get_auth_service,
    get_current_user_allow_password_change,
)
from app.main import create_app
from app.models.master import AppUser
from app.schemas.auth import AuthenticatedUser
from app.security.cookies import CSRF_HEADER_NAME
from app.security.passwords import hash_password
from app.services.auth import (
    AccountLockedError,
    AuthService,
    CurrentPasswordMismatchError,
    InvalidCredentialsError,
    LoginResult,
    PasswordUnchangedError,
    SessionRevokedError,
    TemporaryPasswordExpiredError,
)
from fastapi import FastAPI
from fastapi.testclient import TestClient


def make_settings() -> Settings:
    return Settings(
        _env_file=None,
        database_url="postgresql+psycopg://user:password@localhost/database",
        jwt_secret="test-secret-that-is-at-least-32-characters",
    )


def make_user() -> AppUser:
    return AppUser(
        id=1,
        employee_no="E001",
        display_name="테스트 사용자",
        password_hash=hash_password("correct-password"),
        role="worker",
        must_change_password=False,
        shift_start_local=time(9, 0),
        shift_end_local=time(18, 0),
        failed_login_count=0,
        locked_until=None,
        version=1,
    )


def make_application() -> FastAPI:
    return create_app(
        settings=make_settings(),
        migration_checker=lambda engine, path: None,
    )


def login_service(user: AppUser) -> AuthService:
    service = MagicMock(spec=AuthService)
    service.login.return_value = LoginResult(
        user=user,
        session_id=1,
        access_token="access-token",
        refresh_token="refresh-token",
    )
    return service


def test_login_sets_http_only_auth_cookies() -> None:
    settings = make_settings()
    application = create_app(settings=settings, migration_checker=lambda engine, path: None)
    application.dependency_overrides[get_auth_service] = lambda: login_service(make_user())

    with TestClient(application) as client:
        response = client.post(
            "/api/v1/auth/login",
            json={"employee_no": "E001", "password": "correct-password"},
        )

    assert response.status_code == 200
    assert response.json() == {
        "id": 1,
        "employee_no": "E001",
        "display_name": "테스트 사용자",
        "role": "worker",
        "must_change_password": False,
    }
    assert response.headers["cache-control"] == "no-store"
    cookies = response.headers.get_list("set-cookie")
    assert any(
        item.startswith(settings.access_cookie_name) and "HttpOnly" in item and "Path=/" in item
        for item in cookies
    )
    assert any(
        item.startswith(settings.refresh_cookie_name)
        and "HttpOnly" in item
        and "Path=/api/v1/auth" in item
        for item in cookies
    )
    csrf_cookie = next(item for item in cookies if item.startswith(settings.csrf_cookie_name))
    assert "HttpOnly" not in csrf_cookie
    assert "Path=/" in csrf_cookie


def test_login_failure_returns_contract_error_code() -> None:
    application = make_application()
    service = MagicMock(spec=AuthService)
    service.login.side_effect = InvalidCredentialsError
    application.dependency_overrides[get_auth_service] = lambda: service

    with TestClient(application) as client:
        response = client.post(
            "/api/v1/auth/login",
            json={"employee_no": "E001", "password": "wrong-password"},
        )

    assert response.status_code == 401
    assert response.json()["code"] == "INVALID_CREDENTIALS"


def test_locked_login_returns_retry_after_header() -> None:
    application = make_application()
    service = MagicMock(spec=AuthService)
    service.login.side_effect = AccountLockedError(datetime.now(UTC) + timedelta(seconds=30))
    application.dependency_overrides[get_auth_service] = lambda: service

    with TestClient(application) as client:
        response = client.post(
            "/api/v1/auth/login",
            json={"employee_no": "E001", "password": "correct-password"},
        )

    assert response.status_code == 401
    assert response.json()["code"] == "ACCOUNT_LOCKED"
    assert int(response.headers["retry-after"]) >= 1


def test_expired_temporary_password_login_returns_contract_code() -> None:
    application = make_application()
    service = MagicMock(spec=AuthService)
    service.login.side_effect = TemporaryPasswordExpiredError
    application.dependency_overrides[get_auth_service] = lambda: service

    with TestClient(application) as client:
        response = client.post(
            "/api/v1/auth/login",
            json={"employee_no": "E001", "password": "temporary"},
        )

    assert response.status_code == 401
    assert response.json()["code"] == "TEMPORARY_PASSWORD_EXPIRED"


def test_business_route_requires_password_change(monkeypatch: pytest.MonkeyPatch) -> None:
    user = make_user()
    user.must_change_password = True
    monkeypatch.setattr(
        "app.dependencies.auth.load_authenticated_user",
        lambda request, session, settings: user,
    )

    with TestClient(make_application()) as client:
        response = client.get("/api/v1/process/current")

    assert response.status_code == 403
    assert response.json()["code"] == "PASSWORD_CHANGE_REQUIRED"


def test_me_is_allowed_before_password_change(monkeypatch: pytest.MonkeyPatch) -> None:
    user = make_user()
    user.must_change_password = True
    monkeypatch.setattr(
        "app.dependencies.auth.load_authenticated_user",
        lambda request, session, settings: user,
    )

    with TestClient(make_application()) as client:
        response = client.get("/api/v1/auth/me")

    assert response.status_code == 200
    assert response.json()["must_change_password"] is True


def test_me_requires_access_cookie() -> None:
    with TestClient(make_application()) as client:
        response = client.get("/api/v1/auth/me")

    assert response.status_code == 401
    assert response.json()["code"] == "AUTHENTICATION_REQUIRED"


def test_me_rejects_invalid_access_cookie() -> None:
    settings = make_settings()

    with TestClient(
        create_app(settings=settings, migration_checker=lambda engine, path: None)
    ) as client:
        client.cookies.set(settings.access_cookie_name, "not-a-valid-token")
        response = client.get("/api/v1/auth/me")

    assert response.status_code == 401
    assert response.json()["code"] == "AUTHENTICATION_REQUIRED"


def test_me_returns_authenticated_user() -> None:
    user = make_user()
    application = make_application()
    expected = AuthenticatedUser.model_validate(user)
    application.dependency_overrides[get_current_user_allow_password_change] = lambda: user

    with TestClient(application) as client:
        response = client.get("/api/v1/auth/me")

    assert response.status_code == 200
    assert response.json() == expected.model_dump(mode="json")


def test_login_rejects_empty_fields() -> None:
    with TestClient(make_application()) as client:
        response = client.post("/api/v1/auth/login", json={"employee_no": "", "password": ""})

    assert response.status_code == 422


def make_app_with_settings() -> tuple[FastAPI, Settings]:
    settings = make_settings()
    return (
        create_app(settings=settings, migration_checker=lambda engine, path: None),
        settings,
    )


def refresh_service(user: AppUser) -> AuthService:
    service = MagicMock(spec=AuthService)
    service.refresh.return_value = LoginResult(
        user=user,
        session_id=1,
        access_token="rotated-access-token",
        refresh_token="rotated-refresh-token",
    )
    return service


def test_refresh_requires_matching_csrf_header() -> None:
    application, settings = make_app_with_settings()
    service = refresh_service(make_user())
    application.dependency_overrides[get_auth_service] = lambda: service

    with TestClient(application) as client:
        client.cookies.set(settings.refresh_cookie_name, "refresh-token")
        client.cookies.set(settings.csrf_cookie_name, "csrf-token")
        rejected = client.post("/api/v1/auth/refresh")

        assert rejected.status_code == 403
        assert rejected.json()["code"] == "CSRF_VALIDATION_FAILED"

        accepted = client.post(
            "/api/v1/auth/refresh",
            headers={CSRF_HEADER_NAME: "csrf-token"},
        )

    assert accepted.status_code == 200
    assert accepted.json()["employee_no"] == "E001"
    assert accepted.headers["cache-control"] == "no-store"
    cookies = accepted.headers.get_list("set-cookie")
    assert any(
        item.startswith(settings.access_cookie_name) and "rotated-access-token" in item
        for item in cookies
    )
    assert any(
        item.startswith(settings.refresh_cookie_name) and "rotated-refresh-token" in item
        for item in cookies
    )


def test_refresh_without_refresh_cookie_requests_login() -> None:
    application, settings = make_app_with_settings()

    with TestClient(application) as client:
        client.cookies.set(settings.csrf_cookie_name, "csrf-token")
        response = client.post(
            "/api/v1/auth/refresh",
            headers={CSRF_HEADER_NAME: "csrf-token"},
        )

    assert response.status_code == 401
    assert response.json()["code"] == "AUTHENTICATION_REQUIRED"


def test_refresh_rejection_clears_auth_cookies() -> None:
    application, settings = make_app_with_settings()
    service = MagicMock(spec=AuthService)
    service.refresh.side_effect = SessionRevokedError("revoked")
    application.dependency_overrides[get_auth_service] = lambda: service

    with TestClient(application) as client:
        client.cookies.set(settings.refresh_cookie_name, "refresh-token")
        client.cookies.set(settings.csrf_cookie_name, "csrf-token")
        response = client.post(
            "/api/v1/auth/refresh",
            headers={CSRF_HEADER_NAME: "csrf-token"},
        )

    assert response.status_code == 401
    assert response.json()["code"] == "SESSION_REVOKED"
    assert settings.refresh_cookie_name in response.headers["set-cookie"]


def test_logout_requires_csrf_and_clears_cookies() -> None:
    application, settings = make_app_with_settings()
    service = MagicMock(spec=AuthService)
    application.dependency_overrides[get_auth_service] = lambda: service

    with TestClient(application) as client:
        client.cookies.set(settings.access_cookie_name, "access-token")
        client.cookies.set(settings.refresh_cookie_name, "refresh-token")
        client.cookies.set(settings.csrf_cookie_name, "csrf-token")

        rejected = client.post("/api/v1/auth/logout")
        assert rejected.status_code == 403
        service.logout.assert_not_called()

        response = client.post(
            "/api/v1/auth/logout",
            headers={CSRF_HEADER_NAME: "csrf-token"},
        )

    assert response.status_code == 204
    service.logout.assert_called_once_with(
        access_token="access-token", refresh_token="refresh-token"
    )
    cleared = response.headers.get_list("set-cookie")
    assert len(cleared) == 3
    assert all("Max-Age=0" in item for item in cleared)


def test_change_password_requires_authentication_and_csrf() -> None:
    application, settings = make_app_with_settings()

    with TestClient(application) as client:
        unauthenticated = client.patch(
            "/api/v1/auth/password",
            json={"current_password": "old", "new_password": "new"},
        )
        client.cookies.set(settings.csrf_cookie_name, "csrf-token")
        missing_auth = client.patch(
            "/api/v1/auth/password",
            headers={CSRF_HEADER_NAME: "csrf-token"},
            json={"current_password": "old", "new_password": "new"},
        )

    assert unauthenticated.status_code == 403
    assert unauthenticated.json()["code"] == "CSRF_VALIDATION_FAILED"
    assert missing_auth.status_code == 401
    assert missing_auth.json()["code"] == "AUTHENTICATION_REQUIRED"


def test_change_password_returns_updated_user() -> None:
    user = make_user()
    user.must_change_password = True
    service = MagicMock(spec=AuthService)

    def change_password(
        changed_user: AppUser, *, current_password: str, new_password: str
    ) -> AppUser:
        assert changed_user is user
        assert current_password == "old-password"
        assert new_password == "new-password"
        changed_user.must_change_password = False
        return changed_user

    service.change_password.side_effect = change_password
    application, settings = make_app_with_settings()
    application.dependency_overrides[get_current_user_allow_password_change] = lambda: user
    application.dependency_overrides[get_auth_service] = lambda: service

    with TestClient(application) as client:
        client.cookies.set(settings.csrf_cookie_name, "csrf-token")
        response = client.patch(
            "/api/v1/auth/password",
            headers={CSRF_HEADER_NAME: "csrf-token"},
            json={
                "current_password": "old-password",
                "new_password": "new-password",
            },
        )

    assert response.status_code == 200
    assert response.json()["must_change_password"] is False
    assert response.headers["cache-control"] == "no-store"


def test_change_password_maps_domain_errors() -> None:
    user = make_user()
    application, settings = make_app_with_settings()
    service = MagicMock(spec=AuthService)
    application.dependency_overrides[get_current_user_allow_password_change] = lambda: user
    application.dependency_overrides[get_auth_service] = lambda: service

    with TestClient(application) as client:
        client.cookies.set(settings.csrf_cookie_name, "csrf-token")
        service.change_password.side_effect = CurrentPasswordMismatchError
        mismatch = client.patch(
            "/api/v1/auth/password",
            headers={CSRF_HEADER_NAME: "csrf-token"},
            json={"current_password": "wrong", "new_password": "new"},
        )

        service.change_password.side_effect = PasswordUnchangedError
        unchanged = client.patch(
            "/api/v1/auth/password",
            headers={CSRF_HEADER_NAME: "csrf-token"},
            json={"current_password": "same", "new_password": "same"},
        )

    assert mismatch.status_code == 400
    assert mismatch.json()["code"] == "CURRENT_PASSWORD_MISMATCH"
    assert unchanged.status_code == 400
    assert unchanged.json()["code"] == "PASSWORD_UNCHANGED"
