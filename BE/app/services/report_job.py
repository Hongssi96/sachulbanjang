from __future__ import annotations

import hashlib
import json
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.master import AppUser
from app.models.report_job import TERMINAL_JOB_STATES, GenerationJob
from app.repositories.report_job import ReportJobRepository

Clock = Callable[[], datetime]

_ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "accepted": {"querying", "failed"},
    "querying": {"writing", "failed"},
    "writing": {"failed"},
}

_INTERRUPTED_MESSAGE = "서버 중단으로 작업이 끝나지 않았습니다. 다시 시도해 주세요."


def _utc_now() -> datetime:
    return datetime.now(UTC)


def request_digest(payload: dict[str, object]) -> str:
    canonical = json.dumps(
        payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


class ReportJobError(Exception):
    """Base exception for rejected generation job operations."""


class ReportJobNotFoundError(ReportJobError):
    """Raised when a job does not exist or is outside the caller's scope."""


class RequestKeyConflictError(ReportJobError):
    """Raised when a client request key is reused with a different payload."""


class JobNotCancellableError(ReportJobError):
    """Raised when a finished job is cancelled."""


class JobNotRetryableError(ReportJobError):
    """Raised when a job in a non-retryable state is retried."""


class InvalidJobTransitionError(ReportJobError):
    """Raised when a queued job transitions to a disallowed state."""


@dataclass(frozen=True)
class JobPage:
    jobs: list[tuple[GenerationJob, int | None]]
    total_items: int


class ReportJobService:
    """Accept, inspect, cancel, and retry report generation jobs.

    The worker that actually calls the AI is a separate task. This service owns
    the PostgreSQL queue primitives (claim, lease, heartbeat, interruption) and
    the user-facing job API.
    """

    def __init__(
        self,
        session: Session,
        repository: ReportJobRepository,
        clock: Clock = _utc_now,
    ) -> None:
        self._session = session
        self._repository = repository
        self._clock = clock

    def submit_report_job(
        self,
        requester: AppUser,
        *,
        client_request_key: str,
        payload: dict[str, object],
    ) -> tuple[GenerationJob, bool]:
        digest = request_digest(payload)
        existing = self._repository.find_by_request_key(requester.id, "report", client_request_key)
        if existing is not None:
            return self._reuse_or_conflict(existing, digest)

        now = self._clock()
        job = GenerationJob(
            requester_id=requester.id,
            kind="report",
            client_request_key=client_request_key,
            request_payload=payload,
            request_digest=digest,
            state="accepted",
            accepted_at=now,
            data_cutoff_at=self._repository.latest_data_cutoff() or now,
            attempt_count=0,
        )
        try:
            self._repository.add_job(job)
            self._session.commit()
        except IntegrityError:
            self._session.rollback()
            existing = self._repository.find_by_request_key(
                requester.id, "report", client_request_key
            )
            if existing is None:
                raise
            return self._reuse_or_conflict(existing, digest)
        return job, True

    def list_jobs(
        self,
        requester: AppUser,
        *,
        kind: str | None,
        state: str | None,
        page: int,
        page_size: int,
    ) -> JobPage:
        total_items = self._repository.count_jobs(requester_id=requester.id, kind=kind, state=state)
        jobs = self._repository.find_jobs(
            requester_id=requester.id,
            kind=kind,
            state=state,
            offset=(page - 1) * page_size,
            limit=page_size,
        )
        return JobPage(jobs=jobs, total_items=total_items)

    def get_job(self, requester: AppUser, job_id: int) -> tuple[GenerationJob, int | None]:
        return self._owned_job(requester, job_id)

    def cancel_job(self, requester: AppUser, job_id: int) -> GenerationJob:
        job = self._locked_owned_job(requester, job_id)
        if job.state in TERMINAL_JOB_STATES:
            raise JobNotCancellableError
        job.state = "cancelled"
        job.finished_at = self._clock()
        self._session.commit()
        return job

    def retry_job(
        self, requester: AppUser, job_id: int, *, client_request_key: str
    ) -> tuple[GenerationJob, bool]:
        original = self._locked_owned_job(requester, job_id)
        if original.state not in ("failed", "interrupted"):
            raise JobNotRetryableError

        digest = request_digest(original.request_payload)
        existing = self._repository.find_by_request_key(
            requester.id, original.kind, client_request_key
        )
        if existing is not None:
            return self._reuse_or_conflict(existing, digest)

        now = self._clock()
        job = GenerationJob(
            requester_id=requester.id,
            kind=original.kind,
            client_request_key=client_request_key,
            request_payload=original.request_payload,
            request_digest=digest,
            state="accepted",
            accepted_at=now,
            data_cutoff_at=self._repository.latest_data_cutoff() or now,
            retry_of_id=original.id,
            attempt_count=original.attempt_count + 1,
        )
        try:
            self._repository.add_job(job)
            self._session.commit()
        except IntegrityError:
            self._session.rollback()
            existing = self._repository.find_by_request_key(
                requester.id, original.kind, client_request_key
            )
            if existing is None:
                raise
            return self._reuse_or_conflict(existing, digest)
        return job, True

    def claim_next_job(self, *, lease_seconds: int) -> GenerationJob | None:
        job = self._repository.claim_next_accepted()
        if job is None:
            return None
        now = self._clock()
        job.state = "querying"
        job.claimed_at = now
        job.heartbeat_at = now
        job.lease_expires_at = now + timedelta(seconds=lease_seconds)
        job.attempt_count += 1
        self._session.commit()
        return job

    def heartbeat_job(self, job_id: int, *, lease_seconds: int) -> None:
        job = self._repository.lock_job(job_id)
        if job is None or job.state not in ("querying", "writing"):
            raise InvalidJobTransitionError
        now = self._clock()
        job.heartbeat_at = now
        job.lease_expires_at = now + timedelta(seconds=lease_seconds)
        self._session.commit()

    def transition_job(self, job_id: int, target_state: str) -> GenerationJob:
        job = self._repository.lock_job(job_id)
        if job is None:
            raise ReportJobNotFoundError
        if target_state not in _ALLOWED_TRANSITIONS.get(job.state, set()):
            raise InvalidJobTransitionError
        job.state = target_state
        if target_state == "failed":
            job.finished_at = self._clock()
        self._session.commit()
        return job

    def fail_job(self, job_id: int, *, error_code: str, safe_error_message: str) -> GenerationJob:
        job = self._repository.lock_job(job_id)
        if job is None:
            raise ReportJobNotFoundError
        if job.state in TERMINAL_JOB_STATES:
            raise InvalidJobTransitionError
        job.state = "failed"
        job.error_code = error_code
        job.safe_error_message = safe_error_message
        job.finished_at = self._clock()
        self._session.commit()
        return job

    def mark_stale_jobs_interrupted(self) -> int:
        now = self._clock()
        jobs = self._repository.find_stale_jobs(now)
        for job in jobs:
            job.state = "interrupted"
            job.error_code = "WORKER_INTERRUPTED"
            job.safe_error_message = _INTERRUPTED_MESSAGE
            job.finished_at = now
        if jobs:
            self._session.commit()
        return len(jobs)

    def _owned_job(self, requester: AppUser, job_id: int) -> tuple[GenerationJob, int | None]:
        row = self._repository.find_job_with_report(job_id)
        if row is None or row[0].requester_id != requester.id:
            raise ReportJobNotFoundError
        return row

    def _locked_owned_job(self, requester: AppUser, job_id: int) -> GenerationJob:
        job = self._repository.lock_job(job_id)
        if job is None or job.requester_id != requester.id:
            raise ReportJobNotFoundError
        return job

    def _reuse_or_conflict(
        self, existing: GenerationJob, digest: str
    ) -> tuple[GenerationJob, bool]:
        if existing.request_digest != digest:
            raise RequestKeyConflictError
        return existing, False
