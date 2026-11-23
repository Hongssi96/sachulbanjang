from app.core.config import Settings
from app.main import create_app
from fastapi import FastAPI
from fastapi.testclient import TestClient


def make_application() -> FastAPI:
    settings = Settings(
        _env_file=None,
        database_url="postgresql+psycopg://user:password@localhost/database",
        jwt_secret="test-secret-that-is-at-least-32-characters",
    )
    return create_app(settings=settings, migration_checker=lambda engine, path: None)


def test_http_error_body_uses_same_request_id_as_header() -> None:
    with TestClient(make_application()) as client:
        response = client.get(
            "/api/v1/missing",
            headers={"X-Request-ID": "error-contract-test"},
        )

    assert response.status_code == 404
    assert response.json() == {
        "code": "NOT_FOUND",
        "message": "요청한 대상을 찾을 수 없습니다.",
        "request_id": "error-contract-test",
    }
    assert response.headers["X-Request-ID"] == "error-contract-test"


def test_validation_error_exposes_safe_field_details() -> None:
    with TestClient(make_application()) as client:
        response = client.post(
            "/api/v1/auth/login",
            json={"employee_no": "", "password": ""},
        )

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"
    assert response.json()["request_id"] == response.headers["X-Request-ID"]
    assert {detail["field"] for detail in response.json()["details"]} == {
        "employee_no",
        "password",
    }


def test_unhandled_error_hides_internal_detail() -> None:
    application = make_application()

    @application.get("/test/unhandled")
    def raise_unhandled_error() -> None:
        raise RuntimeError("sensitive internal detail")

    with TestClient(application, raise_server_exceptions=False) as client:
        response = client.get("/test/unhandled")

    assert response.status_code == 500
    assert response.json()["code"] == "INTERNAL_SERVER_ERROR"
    assert "sensitive" not in response.text
    assert response.json()["request_id"] == response.headers["X-Request-ID"]
