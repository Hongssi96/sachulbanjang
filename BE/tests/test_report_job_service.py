from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock

import pytest
from app.models.master import AppUser
from app.models.report_job import GenerationJob
from app.repositories.report_job import ReportJobRepository
from app.services.report_job import (
    InvalidJobTransitionError,
    JobNotCancellableError,
    JobNotRetryableError,
    ReportJobNotFoundError,
    ReportJobService,
    RequestKeyConflictError,
    request_digest,
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

NOW = datetime(2026, 11, 23, 6, 0, tzinfo=UTC)
PAYLOAD: dict[str, object] = {
    "report_kind": "weekly",
    "category": "periodic_weekly",
    "period": {"from": None, "to": None},
    "targets": {"department_ids": [], "production_line_ids": [], "equipment_ids": []},
}


def make_user(user_id: int = 1) -> AppUser:
    return AppUser(
        id=user_id,
        employee_no=f"E{user_id:03d}",
        display_name="사용자",
        password_hash="unused",
        role="worker",
        must_change_password=False,
        shift_start_local=datetime(2026, 1, 1, 9, 0).time(),
        shift_end_local=datetime(2026, 1, 1, 18, 0).time(),
        version=1,
    )


def make_job(
    job_id: int = 1,
    *,
    requester_id: int = 1,
    state: str = "accepted",
    client_request_key: str = "key-1",
) -> GenerationJob:
    job = GenerationJob(
        id=job_id,
        requester_id=requester_id,
        kind="report",
        client_request_key=client_request_key,
        request_payload=PAYLOAD,
        request_digest=request_digest(PAYLOAD),
        state=state,
        accepted_at=NOW,
        attempt_count=0,
    )
    return job


def build_service() -> tuple[ReportJobService, MagicMock, MagicMock]:
    session = MagicMock(spec=Session)
    repository = MagicMock(spec=ReportJobRepository)
    repository.latest_data_cutoff.return_value = None
    service = ReportJobService(session, repository, clock=lambda: NOW)
    return service, repository, session


def test_submit_creates_accepted_job() -> None:
    service, repository, session = build_service()
    repository.find_by_request_key.return_value = None

    def add_job(job: GenerationJob) -> None:
        job.id = 7

    repository.add_job.side_effect = add_job

    job, created = service.submit_report_job(
        make_user(), client_request_key="key-1", payload=PAYLOAD
    )

    assert created is True
    assert job.id == 7
    assert job.state == "accepted"
    assert job.request_digest == request_digest(PAYLOAD)
    assert job.data_cutoff_at == NOW
    session.commit.assert_called_once_with()


def test_submit_uses_replay_data_time_as_cutoff() -> None:
    service, repository, _ = build_service()
    repository.find_by_request_key.return_value = None
    replay_time = datetime(2026, 11, 20, 1, 0, tzinfo=UTC)
    repository.latest_data_cutoff.return_value = replay_time

    job, _ = service.submit_report_job(make_user(), client_request_key="key-1", payload=PAYLOAD)

    assert job.data_cutoff_at == replay_time


def test_submit_reuses_same_key_and_payload() -> None:
    service, repository, session = build_service()
    existing = make_job()
    repository.find_by_request_key.return_value = existing

    job, created = service.submit_report_job(
        make_user(), client_request_key="key-1", payload=PAYLOAD
    )

    assert job is existing
    assert created is False
    repository.add_job.assert_not_called()
    session.commit.assert_not_called()


def test_submit_rejects_same_key_with_different_payload() -> None:
    service, repository, _ = build_service()
    repository.find_by_request_key.return_value = make_job()
    other_payload = dict(PAYLOAD)
    other_payload["report_kind"] = "general"

    with pytest.raises(RequestKeyConflictError):
        service.submit_report_job(make_user(), client_request_key="key-1", payload=other_payload)


def test_submit_recovers_from_unique_race() -> None:
    service, repository, session = build_service()
    existing = make_job()
    repository.find_by_request_key.side_effect = [None, existing]
    repository.add_job.side_effect = IntegrityError("insert", {}, Exception("duplicate"))

    job, created = service.submit_report_job(
        make_user(), client_request_key="key-1", payload=PAYLOAD
    )

    assert job is existing
    assert created is False
    session.rollback.assert_called_once_with()
    session.commit.assert_not_called()


def test_list_jobs_scopes_to_requester_and_paginates() -> None:
    service, repository, _ = build_service()
    repository.count_jobs.return_value = 3
    repository.find_jobs.return_value = [(make_job(), None)]

    result = service.list_jobs(
        make_user(user_id=5), kind="report", state="accepted", page=2, page_size=10
    )

    assert result.total_items == 3
    repository.count_jobs.assert_called_once_with(requester_id=5, kind="report", state="accepted")
    repository.find_jobs.assert_called_once_with(
        requester_id=5, kind="report", state="accepted", offset=10, limit=10
    )


def test_get_job_hides_other_requesters() -> None:
    service, repository, _ = build_service()
    repository.find_job_with_report.return_value = (make_job(requester_id=2), None)

    with pytest.raises(ReportJobNotFoundError):
        service.get_job(make_user(user_id=1), 1)

    repository.find_job_with_report.return_value = None
    with pytest.raises(ReportJobNotFoundError):
        service.get_job(make_user(user_id=1), 1)


def test_cancel_only_allows_active_jobs() -> None:
    service, repository, session = build_service()
    active = make_job(state="querying")
    repository.lock_job.return_value = active

    cancelled = service.cancel_job(make_user(), 1)
    assert cancelled.state == "cancelled"
    assert cancelled.finished_at == NOW
    session.commit.assert_called_once_with()

    repository.lock_job.return_value = make_job(state="succeeded")
    with pytest.raises(JobNotCancellableError):
        service.cancel_job(make_user(), 1)


def test_retry_creates_new_job_with_new_key() -> None:
    service, repository, _ = build_service()
    failed = make_job(state="failed", client_request_key="key-1")
    failed.attempt_count = 2
    repository.lock_job.return_value = failed
    repository.find_by_request_key.return_value = None

    job, created = service.retry_job(make_user(), 1, client_request_key="key-2")

    assert created is True
    assert job.client_request_key == "key-2"
    assert job.retry_of_id == 1
    assert job.attempt_count == 3
    assert job.state == "accepted"

    repository.lock_job.return_value = make_job(state="accepted")
    with pytest.raises(JobNotRetryableError):
        service.retry_job(make_user(), 1, client_request_key="key-3")


def test_claim_sets_lease_and_increments_attempt() -> None:
    service, repository, session = build_service()
    job = make_job()
    repository.claim_next_accepted.return_value = job

    claimed = service.claim_next_job(lease_seconds=60)

    assert claimed is job
    assert job.state == "querying"
    assert job.claimed_at == NOW
    assert job.lease_expires_at == NOW + timedelta(seconds=60)
    assert job.attempt_count == 1
    session.commit.assert_called_once_with()

    repository.claim_next_accepted.return_value = None
    assert service.claim_next_job(lease_seconds=60) is None


def test_heartbeat_requires_running_job() -> None:
    service, repository, _ = build_service()
    repository.lock_job.return_value = make_job(state="querying")

    service.heartbeat_job(1, lease_seconds=60)
    assert repository.lock_job.return_value.lease_expires_at is not None

    repository.lock_job.return_value = make_job(state="accepted")
    with pytest.raises(InvalidJobTransitionError):
        service.heartbeat_job(1, lease_seconds=60)


def test_fail_and_interrupt_mark_terminal_states() -> None:
    service, repository, session = build_service()
    repository.lock_job.return_value = make_job(state="writing")

    failed = service.fail_job(1, error_code="AI_ERROR", safe_error_message="생성 실패")
    assert failed.state == "failed"
    assert failed.error_code == "AI_ERROR"
    assert failed.finished_at == NOW

    repository.lock_job.return_value = make_job(state="cancelled")
    with pytest.raises(InvalidJobTransitionError):
        service.fail_job(1, error_code="X", safe_error_message="y")

    repository.find_stale_jobs.return_value = [make_job(state="querying")]
    count = service.mark_stale_jobs_interrupted()
    assert count == 1
    stale = repository.find_stale_jobs.return_value[0]
    assert stale.state == "interrupted"
    assert stale.error_code == "WORKER_INTERRUPTED"
    assert stale.safe_error_message
    session.commit.assert_called()
