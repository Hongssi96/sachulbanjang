from datetime import UTC, datetime
from typing import cast
from unittest.mock import MagicMock

from app.integrations.ai import AiGenerationError, OpenAiCompatibleClient
from app.models.report import Report
from app.models.report_job import GenerationJob
from app.repositories.report import ReportRepository
from app.repositories.report_generation import GenerationTotals, ReportGenerationRepository
from app.repositories.report_job import ReportJobRepository
from app.services.report_generation import ReportGenerationService
from app.services.report_job import ReportJobService, request_digest
from sqlalchemy.orm import Session

NOW = datetime(2026, 11, 23, 6, 0, tzinfo=UTC)
PAYLOAD: dict[str, object] = {
    "report_kind": "weekly",
    "category": "periodic_weekly",
    "period": {"from": "2026-11-17", "to": "2026-11-23"},
    "targets": {"department_ids": [1], "production_line_ids": [2], "equipment_ids": [3]},
}


def make_job(state: str = "accepted") -> GenerationJob:
    return GenerationJob(
        id=7,
        requester_id=11,
        kind="report",
        client_request_key="request-1",
        request_payload=PAYLOAD,
        request_digest=request_digest(PAYLOAD),
        state=state,
        accepted_at=NOW,
        data_cutoff_at=NOW,
        attempt_count=0,
    )


def build_service() -> tuple[ReportGenerationService, MagicMock, dict[str, MagicMock]]:
    session = MagicMock(spec=Session)
    ai_client = MagicMock(spec=OpenAiCompatibleClient)
    service = ReportGenerationService(session, ai_client, lease_seconds=300)
    mocks = {
        "job_service": MagicMock(),
        "job_repository": MagicMock(),
        "generation_repository": MagicMock(),
        "report_repository": MagicMock(),
    }
    service._job_service = cast(ReportJobService, mocks["job_service"])
    service._job_repository = cast(ReportJobRepository, mocks["job_repository"])
    service._generation_repository = cast(
        ReportGenerationRepository, mocks["generation_repository"]
    )
    service._report_repository = cast(ReportRepository, mocks["report_repository"])
    return service, ai_client, mocks


def configure_aggregate(repository: MagicMock) -> None:
    repository.resolve_equipment_ids.return_value = [3, 4]
    repository.equipment_labels.return_value = [
        {"id": 3, "code": "EQ-3", "name": "3호기", "production_line": "1라인"}
    ]
    repository.totals.return_value = GenerationTotals(
        production_record_count=10,
        inspected_count=8,
        good_count=6,
        defect_count=2,
        includes_demo=True,
    )
    repository.defect_type_counts.return_value = [("흑점", 2)]


def test_process_next_publishes_report_and_snapshot_atomically() -> None:
    service, ai_client, mocks = build_service()
    job = make_job()
    mocks["job_service"].claim_next_job.return_value = job
    mocks["job_service"].transition_job.side_effect = lambda job_id, state: setattr(
        job, "state", state
    )
    configure_aggregate(mocks["generation_repository"])
    ai_client.generate_markdown.return_value = "## 집계 기준\n본문"
    mocks["job_repository"].lock_job.return_value = job
    mocks["job_repository"].find_job_with_report.return_value = (job, None)

    def assign_report_id(report: Report) -> None:
        report.id = 99

    mocks["report_repository"].add_report.side_effect = assign_report_id

    result = service.process_next()

    assert result is not None
    assert result.state == "succeeded"
    assert result.report_id == 99
    mocks["job_service"].transition_job.assert_called_once_with(7, "writing")
    created_report = mocks["report_repository"].add_report.call_args.args[0]
    assert created_report.generation_job_id == 7
    assert created_report.generation_snapshot["data_cutoff_label"] == "2026-11-23 15:00 (KST)"
    assert created_report.generation_snapshot["summary"]["defect_rate_percent"] == "25.00"
    assert created_report.body_markdown == "## 집계 기준\n본문"
    assert job.state == "succeeded"
    cast(MagicMock, service._session).commit.assert_called_once_with()
    prompt = ai_client.generate_markdown.call_args.kwargs["user_prompt"]
    assert "employee_no" not in prompt
    assert "password" not in prompt


def test_process_next_marks_ai_failure_without_creating_report() -> None:
    service, ai_client, mocks = build_service()
    job = make_job()
    mocks["job_service"].claim_next_job.return_value = job
    configure_aggregate(mocks["generation_repository"])
    ai_client.generate_markdown.side_effect = AiGenerationError("provider detail")

    result = service.process_next()

    assert result is not None
    assert result.state == "failed"
    mocks["report_repository"].add_report.assert_not_called()
    mocks["job_service"].fail_job.assert_called_once_with(
        7,
        error_code="AI_GENERATION_FAILED",
        safe_error_message="AI 보고서 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    )


def test_process_next_returns_none_when_queue_is_empty() -> None:
    service, _, mocks = build_service()
    mocks["job_service"].claim_next_job.return_value = None

    assert service.process_next() is None
