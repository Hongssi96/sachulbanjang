from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime

from sqlalchemy.orm import Session

from app.models.master import AppUser
from app.models.report import Report, ReportRevision, ReportStatusEvent
from app.repositories.report import ReportRepository, ReportView
from app.services.record_history import period_bounds

Clock = Callable[[], datetime]

_ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "pending": {"in_progress", "completed"},
    "in_progress": {"completed"},
    "completed": {"in_progress"},
}


def _utc_now() -> datetime:
    return datetime.now(UTC)


class ReportError(Exception):
    """Base exception for rejected report operations."""


class ReportNotFoundError(ReportError):
    """Raised when a report does not exist or is outside the caller's scope."""


class ReportVersionConflictError(ReportError):
    """Raised when an update is based on an outdated report version."""

    def __init__(self, current_version: int) -> None:
        self.current_version = current_version
        super().__init__("report was changed by another request")


class ReportLockedError(ReportError):
    """Raised when a worker edits or deletes a completed report."""


class InvalidReportStatusError(ReportError):
    """Raised for a status change that the transition rules do not allow."""


class NoReportChangeError(ReportError):
    """Raised when an update does not change the title or body."""


@dataclass(frozen=True)
class CreateReportCommand:
    title: str
    body_markdown: str
    category: str
    report_kind: str


@dataclass(frozen=True)
class ReportPage:
    reports: list[ReportView]
    total_items: int


class ReportService:
    """Report CRUD with author/admin permissions, versioning, and history."""

    def __init__(
        self,
        session: Session,
        repository: ReportRepository,
        clock: Clock = _utc_now,
    ) -> None:
        self._session = session
        self._repository = repository
        self._clock = clock

    def create_report(self, author: AppUser, command: CreateReportCommand) -> ReportView:
        report = Report(
            author_id=author.id,
            title=command.title,
            body_markdown=command.body_markdown,
            category=command.category,
            report_kind=command.report_kind,
            business_status="pending",
            version=1,
        )
        self._repository.add_report(report)
        self._repository.add_revision(
            ReportRevision(
                report_id=report.id,
                version=1,
                title=report.title,
                body_markdown=report.body_markdown,
                editor_id=author.id,
                created_at=self._clock(),
            )
        )
        self._session.commit()
        return self._visible_report(author, report.id)

    def list_reports(
        self,
        actor: AppUser,
        *,
        query: str | None,
        category: str | None,
        business_status: str | None,
        date_from: date | None,
        date_to: date | None,
        page: int,
        page_size: int,
    ) -> ReportPage:
        normalized = query.strip() if query is not None else ""
        period_from, period_to = period_bounds(date_from, date_to)
        author_id = None if actor.role == "admin" else actor.id
        total_items = self._repository.count_reports(
            author_id=author_id,
            query=normalized or None,
            category=category,
            business_status=business_status,
            period_from=period_from,
            period_to=period_to,
        )
        reports = self._repository.find_reports(
            author_id=author_id,
            query=normalized or None,
            category=category,
            business_status=business_status,
            period_from=period_from,
            period_to=period_to,
            offset=(page - 1) * page_size,
            limit=page_size,
        )
        return ReportPage(reports=reports, total_items=total_items)

    def get_report(self, actor: AppUser, report_id: int) -> ReportView:
        return self._visible_report(actor, report_id)

    def update_report(
        self,
        actor: AppUser,
        report_id: int,
        *,
        version: int,
        title: str | None,
        body_markdown: str | None,
    ) -> ReportView:
        report = self._locked_report_for_write(actor, report_id)
        if report.version != version:
            raise ReportVersionConflictError(report.version)

        changed = False
        if title is not None and title != report.title:
            report.title = title
            changed = True
        if body_markdown is not None and body_markdown != report.body_markdown:
            report.body_markdown = body_markdown
            changed = True
        if not changed:
            raise NoReportChangeError

        report.version += 1
        report.last_editor_id = actor.id
        self._repository.add_revision(
            ReportRevision(
                report_id=report.id,
                version=report.version,
                title=report.title,
                body_markdown=report.body_markdown,
                editor_id=actor.id,
                created_at=self._clock(),
            )
        )
        self._session.commit()
        return self._visible_report(actor, report.id)

    def change_status(
        self, actor: AppUser, report_id: int, *, version: int, business_status: str
    ) -> ReportView:
        report = self._repository.find_report_for_update(report_id)
        if report is None:
            raise ReportNotFoundError
        if report.version != version:
            raise ReportVersionConflictError(report.version)
        before_status = report.business_status
        if business_status not in _ALLOWED_TRANSITIONS.get(before_status, set()):
            raise InvalidReportStatusError

        report.business_status = business_status
        report.version += 1
        self._repository.add_status_event(
            ReportStatusEvent(
                report_id=report.id,
                before_status=before_status,
                after_status=business_status,
                actor_id=actor.id,
                created_at=self._clock(),
            )
        )
        self._session.commit()
        return self._visible_report(actor, report.id)

    def delete_report(self, actor: AppUser, report_id: int, *, expected_version: int) -> None:
        report = self._locked_report_for_write(actor, report_id)
        if report.version != expected_version:
            raise ReportVersionConflictError(report.version)
        report.deleted_at = self._clock()
        report.version += 1
        self._session.commit()

    def list_revisions(self, actor: AppUser, report_id: int) -> list[tuple[ReportRevision, str]]:
        self._visible_report(actor, report_id)
        return self._repository.list_revisions(report_id)

    def get_revision(
        self, actor: AppUser, report_id: int, version: int
    ) -> tuple[ReportRevision, str]:
        self._visible_report(actor, report_id)
        revision = self._repository.find_revision(report_id, version)
        if revision is None:
            raise ReportNotFoundError
        return revision

    def list_status_events(
        self, actor: AppUser, report_id: int
    ) -> list[tuple[ReportStatusEvent, str]]:
        self._visible_report(actor, report_id)
        return self._repository.list_status_events(report_id)

    def _visible_report(self, actor: AppUser, report_id: int) -> ReportView:
        view = self._repository.find_report(report_id)
        if view is None:
            raise ReportNotFoundError
        if actor.role != "admin" and view.report.author_id != actor.id:
            raise ReportNotFoundError
        return view

    def _locked_report_for_write(self, actor: AppUser, report_id: int) -> Report:
        report = self._repository.find_report_for_update(report_id)
        if report is None:
            raise ReportNotFoundError
        if actor.role == "admin":
            return report
        if report.author_id != actor.id:
            raise ReportNotFoundError
        if report.business_status == "completed":
            raise ReportLockedError
        return report
