from datetime import UTC, datetime, time, timedelta
from unittest.mock import MagicMock

from app.core.config import Settings
from app.dependencies.auth import get_auth_service, get_current_user
from app.main import create_app
from app.models.master import AppUser
from app.schemas.auth import AuthenticatedUser
from app.security.passwords import hash_password
from app.services.auth import AccountLockedError, AuthService, InvalidCredentialsError, LoginResult
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
    assert response.json()["detail"]["code"] == "INVALID_CREDENTIALS"


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
    assert response.json()["detail"]["code"] == "ACCOUNT_LOCKED"
    assert int(response.headers["retry-after"]) >= 1


def test_me_requires_access_cookie() -> None:
    with TestClient(make_application()) as client:
        response = client.get("/api/v1/auth/me")

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "AUTHENTICATION_REQUIRED"


def test_me_rejects_invalid_access_cookie() -> None:
    settings = make_settings()

    with TestClient(
        create_app(settings=settings, migration_checker=lambda engine, path: None)
    ) as client:
        client.cookies.set(settings.access_cookie_name, "not-a-valid-token")
        response = client.get("/api/v1/auth/me")

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "AUTHENTICATION_REQUIRED"


def test_me_returns_authenticated_user() -> None:
    user = make_user()
    application = make_application()
    expected = AuthenticatedUser.model_validate(user)
    application.dependency_overrides[get_current_user] = lambda: user

    with TestClient(application) as client:
        response = client.get("/api/v1/auth/me")

    assert response.status_code == 200
    assert response.json() == expected.model_dump(mode="json")


def test_login_rejects_empty_fields() -> None:
    with TestClient(make_application()) as client:
        response = client.post("/api/v1/auth/login", json={"employee_no": "", "password": ""})

    assert response.status_code == 422
