from datetime import UTC, datetime, time
from unittest.mock import MagicMock

from app.core.config import Settings
from app.dependencies.auth import get_current_user
from app.main import create_app
from app.models.master import AppUser
from app.models.report_job import GenerationJob
from app.routers.report_jobs import get_report_job_service
from app.services.report_job import (
    JobNotCancellableError,
    JobNotRetryableError,
    JobPage,
    ReportJobNotFoundError,
    ReportJobService,
    RequestKeyConflictError,
    request_digest,
)
from fastapi import FastAPI
from fastapi.testclient import TestClient

NOW = datetime(2026, 11, 23, 6, 0, tzinfo=UTC)
PAYLOAD: dict[str, object] = {
    "report_kind": "weekly",
    "category": "periodic_weekly",
    "period": {"from": None, "to": None},
    "targets": {"department_ids": [], "production_line_ids": [], "equipment_ids": []},
}


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
        display_name="사용자",
        password_hash="unused",
        role="worker",
        must_change_password=False,
        shift_start_local=time(9, 0),
        shift_end_local=time(18, 0),
        version=1,
    )


def make_job(state: str = "accepted") -> GenerationJob:
    return GenerationJob(
        id=1,
        requester_id=1,
        kind="report",
        client_request_key="key-1",
        request_payload=PAYLOAD,
        request_digest=request_digest(PAYLOAD),
        state=state,
        accepted_at=NOW,
        data_cutoff_at=NOW,
        attempt_count=0,
    )


def make_application(service: ReportJobService | None = None) -> FastAPI:
    application = create_app(
        settings=make_settings(),
        migration_checker=lambda engine, path: None,
    )
    application.dependency_overrides[get_current_user] = make_user
    if service is not None:
        application.dependency_overrides[get_report_job_service] = lambda: service
    return application


def with_csrf(client: TestClient) -> dict[str, str]:
    settings = make_settings()
    client.cookies.set(settings.csrf_cookie_name, "csrf-token")
    return {"X-CSRF-Token": "csrf-token"}


def test_jobs_require_authentication() -> None:
    application = create_app(settings=make_settings(), migration_checker=lambda engine, path: None)

    with TestClient(application) as client:
        response = client.get("/api/v1/jobs")

    assert response.status_code == 401
    assert response.json()["code"] == "AUTHENTICATION_REQUIRED"


def test_submit_report_job_returns_accepted() -> None:
    service = MagicMock(spec=ReportJobService)
    service.submit_report_job.return_value = (make_job(), True)
    application = make_application(service)

    with TestClient(application) as client:
        headers = with_csrf(client)
        response = client.post(
            "/api/v1/report-jobs",
            json={
                "client_request_key": "key-1",
                "category": "periodic_weekly",
                "report_kind": "weekly",
            },
            headers=headers,
        )

    assert response.status_code == 202
    assert response.json() == {
        "job_id": 1,
        "state": "accepted",
        "accepted_at": "2026-11-23T06:00:00Z",
        "data_cutoff_at": "2026-11-23T06:00:00Z",
    }
    kwargs = service.submit_report_job.call_args.kwargs
    assert kwargs["client_request_key"] == "key-1"
    assert kwargs["payload"] == PAYLOAD


def test_submit_requires_csrf_and_validates_payload() -> None:
    service = MagicMock(spec=ReportJobService)
    application = make_application(service)

    with TestClient(application) as client:
        missing_csrf = client.post(
            "/api/v1/report-jobs",
            json={"client_request_key": "key-1", "category": "other"},
        )
        headers = with_csrf(client)
        mismatch = client.post(
            "/api/v1/report-jobs",
            json={
                "client_request_key": "key-1",
                "category": "periodic_weekly",
                "report_kind": "general",
            },
            headers=headers,
        )
        bad_period = client.post(
            "/api/v1/report-jobs",
            json={
                "client_request_key": "key-1",
                "category": "other",
                "period": {"from": "2026-11-24", "to": "2026-11-20"},
            },
            headers=headers,
        )

    assert missing_csrf.status_code == 403
    assert mismatch.status_code == 422
    assert bad_period.status_code == 422
    service.submit_report_job.assert_not_called()


def test_submit_conflict_returns_409() -> None:
    service = MagicMock(spec=ReportJobService)
    service.submit_report_job.side_effect = RequestKeyConflictError
    application = make_application(service)

    with TestClient(application) as client:
        headers = with_csrf(client)
        response = client.post(
            "/api/v1/report-jobs",
            json={"client_request_key": "key-1", "category": "other"},
            headers=headers,
        )

    assert response.status_code == 409
    assert response.json()["code"] == "REQUEST_KEY_CONFLICT"


def test_list_jobs_returns_items() -> None:
    service = MagicMock(spec=ReportJobService)
    service.list_jobs.return_value = JobPage(jobs=[(make_job(), None)], total_items=1)
    application = make_application(service)

    with TestClient(application) as client:
        response = client.get("/api/v1/jobs", params={"kind": "report", "state": "accepted"})

    assert response.status_code == 200
    body = response.json()
    assert body["items"][0]["job_id"] == 1
    assert body["items"][0]["report_id"] is None
    assert body["pagination"]["total_items"] == 1
    kwargs = service.list_jobs.call_args.kwargs
    assert kwargs["kind"] == "report"
    assert kwargs["state"] == "accepted"


def test_job_detail_returns_not_found() -> None:
    service = MagicMock(spec=ReportJobService)
    service.get_job.side_effect = ReportJobNotFoundError
    application = make_application(service)

    with TestClient(application) as client:
        response = client.get("/api/v1/jobs/1")

    assert response.status_code == 404
    assert response.json()["code"] == "JOB_NOT_FOUND"


def test_cancel_and_retry_map_domain_errors() -> None:
    application = make_application(MagicMock(spec=ReportJobService))

    with TestClient(application) as client:
        headers = with_csrf(client)
        cancel_service = MagicMock(spec=ReportJobService)
        cancel_service.cancel_job.side_effect = JobNotCancellableError
        application.dependency_overrides[get_report_job_service] = lambda: cancel_service
        cancelled = client.post("/api/v1/jobs/1/cancel", headers=headers)

        retry_service = MagicMock(spec=ReportJobService)
        retry_service.retry_job.side_effect = JobNotRetryableError
        application.dependency_overrides[get_report_job_service] = lambda: retry_service
        retried = client.post(
            "/api/v1/jobs/1/retry", json={"client_request_key": "key-2"}, headers=headers
        )

    assert cancelled.status_code == 409
    assert cancelled.json()["code"] == "JOB_NOT_CANCELLABLE"
    assert retried.status_code == 409
    assert retried.json()["code"] == "JOB_NOT_RETRYABLE"


def test_cancel_and_retry_return_job() -> None:
    cancel_service = MagicMock(spec=ReportJobService)
    cancelled_job = make_job(state="cancelled")
    cancel_service.cancel_job.return_value = cancelled_job
    cancel_service.get_job.return_value = (cancelled_job, None)
    application = make_application(cancel_service)

    with TestClient(application) as client:
        headers = with_csrf(client)
        cancelled = client.post("/api/v1/jobs/1/cancel", headers=headers)

    assert cancelled.status_code == 200
    assert cancelled.json()["state"] == "cancelled"
    assert cancelled.headers["cache-control"] == "no-store"

    retry_service = MagicMock(spec=ReportJobService)
    retry_service.retry_job.return_value = (make_job(), True)
    application.dependency_overrides[get_report_job_service] = lambda: retry_service
    with TestClient(application) as client:
        headers = with_csrf(client)
        retried = client.post(
            "/api/v1/jobs/1/retry", json={"client_request_key": "key-2"}, headers=headers
        )
    assert retried.status_code == 202
    assert retried.json()["job_id"] == 1
