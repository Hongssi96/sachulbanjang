from datetime import UTC, date, datetime
from unittest.mock import MagicMock

import pytest
from app.models.master import AppUser
from app.models.report import Report, ReportDownloadEvent, ReportRevision, ReportStatusEvent
from app.repositories.report import ReportRepository, ReportView
from app.services.report import (
    CreateReportCommand,
    InvalidReportStatusError,
    NoReportChangeError,
    ReportLockedError,
    ReportNotFoundError,
    ReportService,
    ReportVersionConflictError,
)
from sqlalchemy.orm import Session

NOW = datetime(2026, 11, 23, 5, 0, tzinfo=UTC)


def make_user(user_id: int = 1, role: str = "worker") -> AppUser:
    return AppUser(
        id=user_id,
        employee_no=f"E{user_id:03d}",
        display_name="사용자",
        password_hash="unused",
        role=role,
        must_change_password=False,
        shift_start_local=datetime(2026, 1, 1, 9, 0).time(),
        shift_end_local=datetime(2026, 1, 1, 18, 0).time(),
        version=1,
    )


def make_report(
    report_id: int = 1,
    *,
    author_id: int = 1,
    status: str = "pending",
    version: int = 1,
) -> Report:
    report = Report(
        id=report_id,
        author_id=author_id,
        title="주간 보고",
        body_markdown="# 내용",
        category="periodic_weekly",
        report_kind="weekly",
        business_status=status,
        version=version,
        created_at=NOW,
        updated_at=NOW,
    )
    return report


def make_view(*, author_id: int = 1, status: str = "pending", version: int = 1) -> ReportView:
    return ReportView(
        report=make_report(author_id=author_id, status=status, version=version),
        author_display_name="작성자",
        last_editor_display_name=None,
    )


def build_service() -> tuple[ReportService, MagicMock, MagicMock]:
    session = MagicMock(spec=Session)
    repository = MagicMock(spec=ReportRepository)
    service = ReportService(session, repository, clock=lambda: NOW)
    return service, repository, session


def test_create_report_saves_first_revision() -> None:
    service, repository, session = build_service()
    created = make_view()

    def add_report(report: Report) -> None:
        report.id = 5

    repository.add_report.side_effect = add_report
    repository.find_report.return_value = created

    service.create_report(
        make_user(),
        CreateReportCommand(
            title="주간 보고",
            body_markdown="# 내용",
            category="periodic_weekly",
            report_kind="weekly",
        ),
    )

    report = repository.add_report.call_args.args[0]
    assert report.business_status == "pending"
    assert report.version == 1
    revision = repository.add_revision.call_args.args[0]
    assert isinstance(revision, ReportRevision)
    assert revision.report_id == 5
    assert revision.version == 1
    assert revision.editor_id == 1
    session.commit.assert_called_once_with()


def test_list_reports_scopes_worker_to_own_reports() -> None:
    service, repository, _ = build_service()
    repository.count_reports.return_value = 1
    repository.find_reports.return_value = [make_view()]

    service.list_reports(
        make_user(user_id=3, role="worker"),
        query="  보고  ",
        category=None,
        business_status=None,
        date_from=date(2026, 11, 23),
        date_to=None,
        page=2,
        page_size=10,
    )

    expected = {
        "author_id": 3,
        "query": "보고",
        "category": None,
        "business_status": None,
        "period_from": datetime(2026, 11, 22, 15, 0, tzinfo=UTC),
        "period_to": None,
    }
    repository.count_reports.assert_called_once_with(**expected)
    repository.find_reports.assert_called_once_with(**expected, offset=10, limit=10)

    repository.reset_mock()
    repository.find_reports.return_value = []
    service.list_reports(
        make_user(role="admin"),
        query=None,
        category=None,
        business_status=None,
        date_from=None,
        date_to=None,
        page=1,
        page_size=10,
    )
    assert repository.count_reports.call_args.kwargs["author_id"] is None


def test_get_report_hides_other_authors_from_worker() -> None:
    service, repository, _ = build_service()
    repository.find_report.return_value = make_view(author_id=2)

    with pytest.raises(ReportNotFoundError):
        service.get_report(make_user(user_id=1), 1)

    repository.find_report.return_value = None
    with pytest.raises(ReportNotFoundError):
        service.get_report(make_user(role="admin"), 1)


def test_worker_updates_own_pending_report_and_records_revision() -> None:
    service, repository, session = build_service()
    report = make_report(status="pending")
    repository.find_report_for_update.return_value = report
    repository.find_report.return_value = make_view(version=2)

    service.update_report(make_user(user_id=1), 1, version=1, title="수정 제목", body_markdown=None)

    assert report.title == "수정 제목"
    assert report.version == 2
    assert report.last_editor_id == 1
    revision = repository.add_revision.call_args.args[0]
    assert revision.version == 2
    assert revision.title == "수정 제목"
    session.commit.assert_called_once_with()


def test_worker_cannot_touch_completed_or_other_reports() -> None:
    service, repository, _ = build_service()
    repository.find_report_for_update.return_value = make_report(status="completed")

    with pytest.raises(ReportLockedError):
        service.update_report(make_user(user_id=1), 1, version=1, title="수정", body_markdown=None)

    repository.find_report_for_update.return_value = make_report(author_id=2)
    with pytest.raises(ReportNotFoundError):
        service.delete_report(make_user(user_id=1), 1, expected_version=1)


def test_update_rejects_stale_version_and_no_change() -> None:
    service, repository, session = build_service()
    repository.find_report_for_update.return_value = make_report(version=3)

    with pytest.raises(ReportVersionConflictError) as caught:
        service.update_report(
            make_user(role="admin"), 1, version=1, title="수정", body_markdown=None
        )
    assert caught.value.current_version == 3

    repository.find_report_for_update.return_value = make_report()
    with pytest.raises(NoReportChangeError):
        service.update_report(
            make_user(role="admin"),
            1,
            version=1,
            title="주간 보고",
            body_markdown="# 내용",
        )
    session.commit.assert_not_called()


def test_admin_changes_status_and_records_event() -> None:
    service, repository, session = build_service()
    report = make_report(status="pending")
    repository.find_report_for_update.return_value = report
    repository.find_report.return_value = make_view(status="completed", version=2)

    service.change_status(make_user(role="admin"), 1, version=1, business_status="completed")

    assert report.business_status == "completed"
    assert report.version == 2
    event = repository.add_status_event.call_args.args[0]
    assert isinstance(event, ReportStatusEvent)
    assert (event.before_status, event.after_status) == ("pending", "completed")
    session.commit.assert_called_once_with()

    repository.find_report_for_update.return_value = make_report(status="completed")
    service.change_status(make_user(role="admin"), 1, version=1, business_status="in_progress")
    assert repository.add_status_event.call_args.args[0].after_status == "in_progress"


def test_status_change_rejects_invalid_transition() -> None:
    service, repository, session = build_service()
    repository.find_report_for_update.return_value = make_report(status="in_progress")

    with pytest.raises(InvalidReportStatusError):
        service.change_status(make_user(role="admin"), 1, version=1, business_status="pending")

    repository.find_report_for_update.return_value = make_report(status="pending")
    with pytest.raises(InvalidReportStatusError):
        service.change_status(make_user(role="admin"), 1, version=1, business_status="pending")
    session.commit.assert_not_called()


def test_delete_soft_deletes_and_bumps_version() -> None:
    service, repository, session = build_service()
    report = make_report()
    repository.find_report_for_update.return_value = report

    service.delete_report(make_user(user_id=1), 1, expected_version=1)

    assert report.deleted_at == NOW
    assert report.version == 2
    session.commit.assert_called_once_with()


def test_history_reads_require_visible_report() -> None:
    service, repository, _ = build_service()
    repository.find_report.return_value = None

    with pytest.raises(ReportNotFoundError):
        service.list_revisions(make_user(role="admin"), 1)
    with pytest.raises(ReportNotFoundError):
        service.list_status_events(make_user(role="admin"), 1)

    repository.find_report.return_value = make_view()
    repository.find_revision.return_value = None
    with pytest.raises(ReportNotFoundError):
        service.get_revision(make_user(user_id=1), 1, 99)


def test_record_pdf_download_saves_actor_and_version() -> None:
    service, repository, session = build_service()
    repository.find_report.return_value = make_view()

    service.record_pdf_download(make_user(user_id=1), 1, 3)

    event = repository.add_download_event.call_args.args[0]
    assert isinstance(event, ReportDownloadEvent)
    assert event.report_id == 1
    assert event.report_version == 3
    assert event.actor_id == 1
    assert event.created_at == NOW
    session.commit.assert_called_once_with()
