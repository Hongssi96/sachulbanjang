from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.orm import Session, aliased

from app.models.master import AppUser
from app.models.report import Report, ReportRevision, ReportStatusEvent


@dataclass(frozen=True)
class ReportView:
    report: Report
    author_display_name: str
    last_editor_display_name: str | None


class ReportRepository:
    """Data access for report CRUD, revisions, and status events."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def _conditions(
        self,
        *,
        author_id: int | None,
        query: str | None,
        category: str | None,
        business_status: str | None,
        period_from: datetime | None,
        period_to: datetime | None,
    ) -> list[ColumnElement[bool]]:
        conditions: list[ColumnElement[bool]] = [Report.deleted_at.is_(None)]
        if author_id is not None:
            conditions.append(Report.author_id == author_id)
        if category is not None:
            conditions.append(Report.category == category)
        if business_status is not None:
            conditions.append(Report.business_status == business_status)
        if period_from is not None:
            conditions.append(Report.created_at >= period_from)
        if period_to is not None:
            conditions.append(Report.created_at < period_to)
        if query:
            escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            pattern = f"%{escaped}%"
            conditions.append(
                or_(
                    Report.title.ilike(pattern, escape="\\"),
                    Report.body_markdown.ilike(pattern, escape="\\"),
                )
            )
        return conditions

    def count_reports(
        self,
        *,
        author_id: int | None,
        query: str | None,
        category: str | None,
        business_status: str | None,
        period_from: datetime | None,
        period_to: datetime | None,
    ) -> int:
        conditions = self._conditions(
            author_id=author_id,
            query=query,
            category=category,
            business_status=business_status,
            period_from=period_from,
            period_to=period_to,
        )
        return (
            self._session.scalar(select(func.count()).select_from(Report).where(*conditions)) or 0
        )

    def find_reports(
        self,
        *,
        author_id: int | None,
        query: str | None,
        category: str | None,
        business_status: str | None,
        period_from: datetime | None,
        period_to: datetime | None,
        offset: int,
        limit: int,
    ) -> list[ReportView]:
        conditions = self._conditions(
            author_id=author_id,
            query=query,
            category=category,
            business_status=business_status,
            period_from=period_from,
            period_to=period_to,
        )
        last_editor = aliased(AppUser)
        statement = (
            select(Report, AppUser.display_name, last_editor.display_name)
            .join(AppUser, AppUser.id == Report.author_id)
            .outerjoin(last_editor, last_editor.id == Report.last_editor_id)
            .where(*conditions)
            .order_by(Report.created_at.desc(), Report.id.desc())
            .offset(offset)
            .limit(limit)
        )
        return [
            ReportView(
                report=report,
                author_display_name=author_name,
                last_editor_display_name=last_editor_name,
            )
            for report, author_name, last_editor_name in self._session.execute(statement).all()
        ]

    def find_report(self, report_id: int) -> ReportView | None:
        last_editor = aliased(AppUser)
        statement = (
            select(Report, AppUser.display_name, last_editor.display_name)
            .join(AppUser, AppUser.id == Report.author_id)
            .outerjoin(last_editor, last_editor.id == Report.last_editor_id)
            .where(Report.id == report_id, Report.deleted_at.is_(None))
        )
        row = self._session.execute(statement).first()
        if row is None:
            return None
        report, author_name, last_editor_name = row
        return ReportView(
            report=report,
            author_display_name=author_name,
            last_editor_display_name=last_editor_name,
        )

    def find_report_for_update(self, report_id: int) -> Report | None:
        return self._session.scalar(
            select(Report)
            .where(Report.id == report_id, Report.deleted_at.is_(None))
            .with_for_update()
        )

    def add_report(self, report: Report) -> None:
        self._session.add(report)
        self._session.flush()

    def add_revision(self, revision: ReportRevision) -> None:
        self._session.add(revision)

    def add_status_event(self, event: ReportStatusEvent) -> None:
        self._session.add(event)

    def list_revisions(self, report_id: int) -> list[tuple[ReportRevision, str]]:
        rows = self._session.execute(
            select(ReportRevision, AppUser.display_name)
            .join(AppUser, AppUser.id == ReportRevision.editor_id)
            .where(ReportRevision.report_id == report_id)
            .order_by(ReportRevision.version.desc())
        )
        return [(revision, editor_name) for revision, editor_name in rows]

    def find_revision(self, report_id: int, version: int) -> tuple[ReportRevision, str] | None:
        row = self._session.execute(
            select(ReportRevision, AppUser.display_name)
            .join(AppUser, AppUser.id == ReportRevision.editor_id)
            .where(
                ReportRevision.report_id == report_id,
                ReportRevision.version == version,
            )
        ).first()
        if row is None:
            return None
        revision, editor_name = row
        return revision, editor_name

    def list_status_events(self, report_id: int) -> list[tuple[ReportStatusEvent, str]]:
        rows = self._session.execute(
            select(ReportStatusEvent, AppUser.display_name)
            .join(AppUser, AppUser.id == ReportStatusEvent.actor_id)
            .where(ReportStatusEvent.report_id == report_id)
            .order_by(ReportStatusEvent.created_at.desc(), ReportStatusEvent.id.desc())
        )
        return [(event, actor_name) for event, actor_name in rows]
