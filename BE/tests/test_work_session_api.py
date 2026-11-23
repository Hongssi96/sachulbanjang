from datetime import UTC, datetime, time, timedelta
from unittest.mock import MagicMock

from app.core.config import Settings
from app.dependencies.auth import get_auth_service, get_current_session_id, get_current_user
from app.main import create_app
from app.models.auth import AuthSession
from app.models.master import AppUser
from app.security.cookies import CSRF_HEADER_NAME
from app.services.auth import AuthService, WorkSessionConflictError
from fastapi import FastAPI
from fastapi.testclient import TestClient

NOW = datetime.now(UTC)


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
        password_hash="unused",
        role="worker",
        must_change_password=False,
        shift_start_local=time(9),
        shift_end_local=time(18),
        failed_login_count=0,
        version=1,
    )


def make_session() -> AuthSession:
    return AuthSession(
        id=7,
        user_id=1,
        absolute_expires_at=NOW + timedelta(days=7),
        work_ends_at=NOW + timedelta(hours=1),
        work_session_version=2,
        current_refresh_generation=1,
    )


def make_application(service: AuthService) -> FastAPI:
    application = create_app(settings=make_settings(), migration_checker=lambda engine, path: None)
    application.dependency_overrides[get_current_user] = make_user
    application.dependency_overrides[get_current_session_id] = lambda: 7
    application.dependency_overrides[get_auth_service] = lambda: service
    return application


def test_read_work_session_returns_shared_end_time() -> None:
    auth_session = make_session()
    service = MagicMock(spec=AuthService)
    service.get_work_session.return_value = auth_session

    with TestClient(make_application(service)) as client:
        response = client.get("/api/v1/work-session")

    assert response.status_code == 200
    assert response.json()["ends_at"] == auth_session.work_ends_at.isoformat().replace(
        "+00:00", "Z"
    )
    assert response.json()["version"] == 2


def test_extension_requires_csrf_and_maps_concurrent_change() -> None:
    auth_session = make_session()
    service = MagicMock(spec=AuthService)
    service.extend_work_session.side_effect = WorkSessionConflictError
    settings = make_settings()

    with TestClient(make_application(service)) as client:
        client.cookies.set(settings.csrf_cookie_name, "csrf-token")
        rejected = client.post(
            "/api/v1/work-session/extensions",
            json={"kind": "automatic", "expected_ends_at": auth_session.work_ends_at.isoformat()},
        )
        conflict = client.post(
            "/api/v1/work-session/extensions",
            headers={CSRF_HEADER_NAME: "csrf-token"},
            json={"kind": "automatic", "expected_ends_at": auth_session.work_ends_at.isoformat()},
        )

    assert rejected.status_code == 403
    assert conflict.status_code == 409
    assert conflict.json()["code"] == "WORK_SESSION_CONFLICT"
