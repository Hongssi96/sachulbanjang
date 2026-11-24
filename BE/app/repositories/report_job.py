from datetime import datetime

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.orm import Session

from app.models.master import AppUser
from app.models.process import ProcessReplay
from app.models.report import Report
from app.models.report_job import GenerationJob


class ReportJobRepository:
    """Data access for the PostgreSQL-backed generation job queue."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def add_job(self, job: GenerationJob) -> None:
        self._session.add(job)
        self._session.flush()

    def find_by_request_key(
        self, requester_id: int, kind: str, client_request_key: str
    ) -> GenerationJob | None:
        return self._session.scalar(
            select(GenerationJob).where(
                GenerationJob.requester_id == requester_id,
                GenerationJob.kind == kind,
                GenerationJob.client_request_key == client_request_key,
            )
        )

    def find_completed_report_by_digest(
        self, requester_id: int, request_digest: str
    ) -> tuple[GenerationJob, int] | None:
        row = self._session.execute(
            select(GenerationJob, Report.id)
            .join(Report, Report.generation_job_id == GenerationJob.id)
            .where(
                GenerationJob.requester_id == requester_id,
                GenerationJob.kind == "report",
                GenerationJob.request_digest == request_digest,
                GenerationJob.state == "succeeded",
                Report.deleted_at.is_(None),
            )
            .order_by(GenerationJob.finished_at.desc(), GenerationJob.id.desc())
            .limit(1)
        ).first()
        if row is None:
            return None
        job, report_id = row
        return job, report_id

    def find_duplicate_reports(
        self, *, request_digest: str, requester_id: int | None, limit: int
    ) -> list[tuple[GenerationJob, Report, str]]:
        conditions: list[ColumnElement[bool]] = [
            GenerationJob.kind == "report",
            GenerationJob.state == "succeeded",
            GenerationJob.request_digest == request_digest,
            Report.deleted_at.is_(None),
        ]
        if requester_id is not None:
            conditions.append(GenerationJob.requester_id == requester_id)
        rows = self._session.execute(
            select(GenerationJob, Report, AppUser.display_name)
            .join(Report, Report.generation_job_id == GenerationJob.id)
            .join(AppUser, AppUser.id == GenerationJob.requester_id)
            .where(*conditions)
            .order_by(GenerationJob.finished_at.desc(), GenerationJob.id.desc())
            .limit(limit)
        )
        return [(job, report, author_name) for job, report, author_name in rows]

    def lock_job(self, job_id: int) -> GenerationJob | None:
        return self._session.scalar(
            select(GenerationJob).where(GenerationJob.id == job_id).with_for_update()
        )

    def find_job(self, job_id: int) -> GenerationJob | None:
        return self._session.get(GenerationJob, job_id)

    def find_job_with_report(self, job_id: int) -> tuple[GenerationJob, int | None] | None:
        row = self._session.execute(
            select(GenerationJob, Report.id)
            .outerjoin(Report, Report.generation_job_id == GenerationJob.id)
            .where(GenerationJob.id == job_id)
        ).first()
        if row is None:
            return None
        job, report_id = row
        return job, report_id

    def _conditions(
        self, *, requester_id: int, kind: str | None, state: str | None
    ) -> list[ColumnElement[bool]]:
        conditions: list[ColumnElement[bool]] = [GenerationJob.requester_id == requester_id]
        if kind is not None:
            conditions.append(GenerationJob.kind == kind)
        if state is not None:
            conditions.append(GenerationJob.state == state)
        return conditions

    def count_jobs(self, *, requester_id: int, kind: str | None, state: str | None) -> int:
        conditions = self._conditions(requester_id=requester_id, kind=kind, state=state)
        return (
            self._session.scalar(select(func.count()).select_from(GenerationJob).where(*conditions))
            or 0
        )

    def find_jobs(
        self,
        *,
        requester_id: int,
        kind: str | None,
        state: str | None,
        offset: int,
        limit: int,
    ) -> list[tuple[GenerationJob, int | None]]:
        conditions = self._conditions(requester_id=requester_id, kind=kind, state=state)
        rows = self._session.execute(
            select(GenerationJob, Report.id)
            .outerjoin(Report, Report.generation_job_id == GenerationJob.id)
            .where(*conditions)
            .order_by(GenerationJob.accepted_at.desc(), GenerationJob.id.desc())
            .offset(offset)
            .limit(limit)
        )
        return [(job, report_id) for job, report_id in rows]

    def latest_data_cutoff(self) -> datetime | None:
        return self._session.scalar(
            select(ProcessReplay.data_time).order_by(ProcessReplay.id.desc()).limit(1)
        )

    def claim_next_accepted(self, *, kind: str | None = None) -> GenerationJob | None:
        statement = select(GenerationJob).where(GenerationJob.state == "accepted")
        if kind is not None:
            statement = statement.where(GenerationJob.kind == kind)
        return self._session.scalar(
            statement.order_by(GenerationJob.accepted_at.asc(), GenerationJob.id.asc())
            .limit(1)
            .with_for_update(skip_locked=True)
        )

    def find_stale_jobs(self, now: datetime, *, kind: str | None = None) -> list[GenerationJob]:
        statement = select(GenerationJob).where(
            GenerationJob.state.in_(("querying", "writing")),
            GenerationJob.lease_expires_at.is_not(None),
            GenerationJob.lease_expires_at < now,
        )
        if kind is not None:
            statement = statement.where(GenerationJob.kind == kind)
        return list(self._session.scalars(statement.with_for_update(skip_locked=True)))
