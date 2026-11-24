from datetime import UTC, datetime, time
from unittest.mock import MagicMock, patch

from app.core.config import Settings
from app.dependencies.auth import get_current_user
from app.main import create_app
from app.models.master import AppUser
from app.models.report import Report, ReportRevision, ReportStatusEvent
from app.repositories.report import ReportView
from app.routers.reports import get_report_service
from app.services.report import (
    CreateReportCommand,
    InvalidReportStatusError,
    NoReportChangeError,
    ReportLockedError,
    ReportNotFoundError,
    ReportPage,
    ReportService,
    ReportVersionConflictError,
)
from app.services.report_pdf import ReportChartError
from fastapi import FastAPI
from fastapi.testclient import TestClient

NOW = datetime(2026, 11, 23, 5, 0, tzinfo=UTC)


def make_settings() -> Settings:
    return Settings(
        _env_file=None,
        database_url="postgresql+psycopg://user:password@localhost/database",
        jwt_secret="test-secret-that-is-at-least-32-characters",
    )


def make_user(user_id: int = 1, role: str = "worker") -> AppUser:
    return AppUser(
        id=user_id,
        employee_no=f"E{user_id:03d}",
        display_name="사용자",
        password_hash="unused",
        role=role,
        must_change_password=False,
        shift_start_local=time(9, 0),
        shift_end_local=time(18, 0),
        version=1,
    )


def make_view(*, author_id: int = 1, status: str = "pending", version: int = 1) -> ReportView:
    report = Report(
        id=1,
        author_id=author_id,
        title="주간 보고",
        body_markdown="# 내용",
        category="periodic_weekly",
        report_kind="weekly",
        business_status=status,
        version=version,
        last_editor_id=None,
        created_at=NOW,
        updated_at=NOW,
    )
    return ReportView(report=report, author_display_name="사용자", last_editor_display_name=None)


def make_application(service: ReportService | None = None) -> FastAPI:
    application = create_app(
        settings=make_settings(),
        migration_checker=lambda engine, path: None,
    )
    application.dependency_overrides[get_current_user] = make_user
    if service is not None:
        application.dependency_overrides[get_report_service] = lambda: service
    return application


def with_csrf(client: TestClient) -> dict[str, str]:
    settings = make_settings()
    client.cookies.set(settings.csrf_cookie_name, "csrf-token")
    return {"X-CSRF-Token": "csrf-token"}


def test_reports_require_authentication() -> None:
    application = create_app(settings=make_settings(), migration_checker=lambda engine, path: None)

    with TestClient(application) as client:
        response = client.get("/api/v1/reports")

    assert response.status_code == 401
    assert response.json()["code"] == "AUTHENTICATION_REQUIRED"


def test_download_report_pdf_records_version() -> None:
    service = MagicMock(spec=ReportService)
    service.get_report.return_value = make_view(version=3)
    application = make_application(service)

    with TestClient(application) as client:
        response = client.get("/api/v1/reports/1/pdf")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["cache-control"] == "no-store"
    assert response.content.startswith(b"%PDF-")
    service.record_pdf_download.assert_called_once_with(service.get_report.call_args.args[0], 1, 3)


def test_download_report_revision_pdf_records_selected_version() -> None:
    revision = ReportRevision(
        id=2,
        report_id=1,
        version=2,
        title="수정 전 주간 보고",
        body_markdown="# 이전 내용",
        editor_id=1,
        created_at=NOW,
    )
    service = MagicMock(spec=ReportService)
    service.get_report.return_value = make_view(version=3)
    service.get_revision.return_value = (revision, "사용자")
    application = make_application(service)

    with TestClient(application) as client:
        response = client.get("/api/v1/reports/1/revisions/2/pdf")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["content-disposition"] == 'attachment; filename="report-1-v2.pdf"'
    assert response.content.startswith(b"%PDF-")
    actor = service.get_report.call_args.args[0]
    service.get_revision.assert_called_once_with(actor, 1, 2)
    service.record_pdf_download.assert_called_once_with(actor, 1, 2)


def test_read_report_defect_chart_uses_stored_snapshot() -> None:
    view = make_view()
    view.report.generation_snapshot = {
        "summary": {
            "defect_types": [
                {"type": "흑점", "count": 5},
                {"type": "치수 불량", "count": 3},
            ]
        }
    }
    service = MagicMock(spec=ReportService)
    service.get_report.return_value = view
    application = make_application(service)

    with TestClient(application) as client:
        response = client.get("/api/v1/reports/1/charts/defect-types")

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.headers["cache-control"] == "no-store"
    assert response.content.startswith(b"\x89PNG\r\n\x1a\n")


def test_read_report_defect_chart_returns_empty_when_snapshot_has_no_defects() -> None:
    view = make_view()
    view.report.generation_snapshot = {"summary": {"defect_types": []}}
    service = MagicMock(spec=ReportService)
    service.get_report.return_value = view
    application = make_application(service)

    with TestClient(application) as client:
        response = client.get("/api/v1/reports/1/charts/defect-types")

    assert response.status_code == 204
    assert response.headers["cache-control"] == "no-store"
    assert response.content == b""


def test_read_report_defect_chart_returns_retryable_error() -> None:
    service = MagicMock(spec=ReportService)
    service.get_report.return_value = make_view()
    application = make_application(service)

    with (
        patch(
            "app.routers.reports.render_report_defect_chart",
            side_effect=ReportChartError("불량 유형 그래프를 생성할 수 없습니다."),
        ),
        TestClient(application) as client,
    ):
        response = client.get("/api/v1/reports/1/charts/defect-types")

    assert response.status_code == 500
    assert response.json()["code"] == "REPORT_CHART_FAILED"


def test_worker_creates_report() -> None:
    service = MagicMock(spec=ReportService)
    service.create_report.return_value = make_view()
    application = make_application(service)

    with TestClient(application) as client:
        headers = with_csrf(client)
        response = client.post(
            "/api/v1/reports",
            json={
                "title": " 주간 보고 ",
                "body_markdown": "# 내용",
                "category": "periodic_weekly",
                "report_kind": "weekly",
            },
            headers=headers,
        )

    assert response.status_code == 201
    assert response.json()["report_id"] == 1
    assert response.json()["business_status"] == "pending"
    assert response.headers["cache-control"] == "no-store"
    actor, command = service.create_report.call_args.args
    assert actor.id == 1
    assert command == CreateReportCommand(
        title="주간 보고",
        body_markdown="# 내용",
        category="periodic_weekly",
        report_kind="weekly",
    )


def test_report_create_validates_category_kind_pair() -> None:
    service = MagicMock(spec=ReportService)
    application = make_application(service)

    with TestClient(application) as client:
        headers = with_csrf(client)
        mismatch = client.post(
            "/api/v1/reports",
            json={
                "title": "제목",
                "body_markdown": "본문",
                "category": "periodic_weekly",
                "report_kind": "general",
            },
            headers=headers,
        )
        blank = client.post(
            "/api/v1/reports",
            json={
                "title": "   ",
                "body_markdown": "본문",
                "category": "other",
                "report_kind": "general",
            },
            headers=headers,
        )

    assert mismatch.status_code == 422
    assert blank.status_code == 422
    service.create_report.assert_not_called()


def test_admin_lists_reports_with_filters() -> None:
    service = MagicMock(spec=ReportService)
    service.list_reports.return_value = ReportPage(reports=[make_view()], total_items=1)
    application = make_application(service)

    with TestClient(application) as client:
        response = client.get(
            "/api/v1/reports",
            params={
                "q": "보고",
                "category": "periodic_weekly",
                "business_status": "pending",
                "page": 1,
                "page_size": 10,
            },
        )

    assert response.status_code == 200
    assert response.json()["items"][0]["report_id"] == 1
    assert response.json()["pagination"]["total_items"] == 1
    service.list_reports.assert_called_once()
    kwargs = service.list_reports.call_args.kwargs
    assert kwargs["query"] == "보고"
    assert kwargs["category"] == "periodic_weekly"
    assert kwargs["business_status"] == "pending"


def test_report_detail_returns_not_found() -> None:
    service = MagicMock(spec=ReportService)
    service.get_report.side_effect = ReportNotFoundError
    application = make_application(service)

    with TestClient(application) as client:
        response = client.get("/api/v1/reports/999")

    assert response.status_code == 404
    assert response.json()["code"] == "REPORT_NOT_FOUND"


def test_report_update_maps_domain_errors() -> None:
    service = MagicMock(spec=ReportService)
    application = make_application(service)

    with TestClient(application) as client:
        headers = with_csrf(client)
        cases = [
            (ReportLockedError(), 403, "REPORT_COMPLETED_LOCKED"),
            (ReportVersionConflictError(3), 409, "VERSION_CONFLICT"),
            (NoReportChangeError(), 422, "VALIDATION_ERROR"),
            (ReportNotFoundError(), 404, "REPORT_NOT_FOUND"),
        ]
        for error, expected_status, expected_code in cases:
            service.update_report.side_effect = error
            response = client.patch(
                "/api/v1/reports/1",
                json={"version": 1, "title": "수정"},
                headers=headers,
            )
            assert response.status_code == expected_status
            assert response.json()["code"] == expected_code

    service = MagicMock(spec=ReportService)
    service.update_report.return_value = make_view(version=2)
    application = make_application(service)
    with TestClient(application) as client:
        headers = with_csrf(client)
        updated = client.patch(
            "/api/v1/reports/1", json={"version": 1, "title": "수정"}, headers=headers
        )
    assert updated.status_code == 200
    assert updated.json()["version"] == 2


def test_status_change_requires_admin() -> None:
    service = MagicMock(spec=ReportService)
    application = create_app(settings=make_settings(), migration_checker=lambda engine, path: None)
    application.dependency_overrides[get_current_user] = lambda: make_user(role="worker")
    application.dependency_overrides[get_report_service] = lambda: service

    with TestClient(application) as client:
        headers = with_csrf(client)
        forbidden = client.patch(
            "/api/v1/reports/1/status",
            json={"version": 1, "business_status": "completed"},
            headers=headers,
        )

    assert forbidden.status_code == 403
    assert forbidden.json()["code"] == "FORBIDDEN"
    service.change_status.assert_not_called()

    service.change_status.side_effect = InvalidReportStatusError
    application.dependency_overrides[get_current_user] = lambda: make_user(role="admin")
    with TestClient(application) as client:
        headers = with_csrf(client)
        invalid = client.patch(
            "/api/v1/reports/1/status",
            json={"version": 1, "business_status": "pending"},
            headers=headers,
        )
    assert invalid.status_code == 422
    assert invalid.json()["code"] == "VALIDATION_ERROR"


def test_delete_requires_expected_version() -> None:
    service = MagicMock(spec=ReportService)
    application = make_application(service)

    with TestClient(application) as client:
        headers = with_csrf(client)
        missing = client.delete("/api/v1/reports/1", headers=headers)
        deleted = client.delete("/api/v1/reports/1?expected_version=1", headers=headers)

    assert missing.status_code == 422
    assert deleted.status_code == 204
    args, kwargs = service.delete_report.call_args
    assert args[0].id == 1
    assert args[1] == 1
    assert kwargs == {"expected_version": 1}


def test_history_endpoints_return_items() -> None:
    revision = ReportRevision(
        id=1,
        report_id=1,
        version=1,
        title="주간 보고",
        body_markdown="# 내용",
        editor_id=1,
        created_at=NOW,
    )
    event = ReportStatusEvent(
        id=2,
        report_id=1,
        before_status="pending",
        after_status="completed",
        actor_id=9,
        created_at=NOW,
    )
    service = MagicMock(spec=ReportService)
    service.list_revisions.return_value = [(revision, "사용자")]
    service.get_revision.return_value = (revision, "사용자")
    service.list_status_events.return_value = [(event, "관리자")]
    application = make_application(service)

    with TestClient(application) as client:
        revisions = client.get("/api/v1/reports/1/revisions")
        revision_one = client.get("/api/v1/reports/1/revisions/1")
        events = client.get("/api/v1/reports/1/status-events")

    assert revisions.status_code == 200
    assert revisions.json()["items"][0]["version"] == 1
    assert revision_one.json()["editor_display_name"] == "사용자"
    assert events.json()["items"][0]["after_status"] == "completed"
    assert events.json()["items"][0]["actor_display_name"] == "관리자"


def test_report_detail_includes_kst_cutoff_label() -> None:
    service = MagicMock(spec=ReportService)
    view = make_view()
    view.report.generation_data_cutoff_at = datetime(2026, 11, 23, 6, 0, tzinfo=UTC)
    service.get_report.return_value = view
    application = make_application(service)

    with TestClient(application) as client:
        response = client.get("/api/v1/reports/1")

    assert response.status_code == 200
    body = response.json()
    assert body["generation_data_cutoff_at"] == "2026-11-23T06:00:00Z"
    assert body["generation_data_cutoff_label"] == "2026-11-23 15:00 (KST)"
