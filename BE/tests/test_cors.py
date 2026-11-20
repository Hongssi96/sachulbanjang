from app.core.config import Settings
from app.main import create_app
from fastapi import FastAPI
from fastapi.testclient import TestClient


def make_application(cors_origins: list[str]) -> FastAPI:
    settings = Settings(
        _env_file=None,
        database_url="postgresql+psycopg://user:password@localhost/database",
        jwt_secret="test-secret-that-is-at-least-32-characters",
        cors_origins=cors_origins,
    )
    return create_app(settings=settings, migration_checker=lambda engine, path: None)


def test_preflight_allows_configured_fe_origin_with_credentials() -> None:
    application = make_application(["http://localhost:5173"])

    with TestClient(application) as client:
        response = client.options(
            "/api/v1/auth/login",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert response.headers["access-control-allow-credentials"] == "true"
    assert response.headers["x-request-id"]


def test_actual_request_returns_cors_headers() -> None:
    application = make_application(["http://localhost:5174"])

    with TestClient(application) as client:
        response = client.get(
            "/api/v1/health/live",
            headers={"Origin": "http://localhost:5174"},
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5174"


def test_unconfigured_origin_receives_no_cors_headers() -> None:
    application = make_application(["http://localhost:5173"])

    with TestClient(application) as client:
        response = client.get(
            "/api/v1/health/live",
            headers={"Origin": "http://evil.example"},
        )

    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers


def test_cors_is_skipped_when_no_origin_is_configured() -> None:
    application = make_application([])

    with TestClient(application) as client:
        response = client.get(
            "/api/v1/health/live",
            headers={"Origin": "http://localhost:5173"},
        )

    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers
