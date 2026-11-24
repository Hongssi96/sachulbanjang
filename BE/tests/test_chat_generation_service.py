from datetime import UTC, datetime
from typing import cast
from unittest.mock import MagicMock

from app.integrations.ai import AiGenerationError, OpenAiCompatibleClient
from app.models.conversation import AnswerEvidence, ChatTurn, Conversation
from app.models.master import AppUser
from app.models.report_job import GenerationJob
from app.repositories.conversation import ConversationRepository
from app.repositories.report_job import ReportJobRepository
from app.services.chat_generation import ChatGenerationService
from app.services.chat_tools import (
    ChatQueryResult,
    ChatToolExecutor,
    EvidenceSource,
)
from app.services.report_job import ReportJobService
from sqlalchemy.orm import Session

NOW = datetime(2026, 11, 24, 6, 0, tzinfo=UTC)


def make_job(state: str = "accepted") -> GenerationJob:
    return GenerationJob(
        id=7,
        requester_id=1,
        kind="chat",
        client_request_key="key-1",
        request_payload={
            "conversation_id": 1,
            "question": "최근 7일 불량률 알려줘",
            "refresh_of_turn_id": None,
        },
        request_digest="digest",
        state=state,
        accepted_at=NOW,
        data_cutoff_at=NOW,
        attempt_count=1,
    )


def make_turn(query_scope: dict[str, object] | None = None) -> ChatTurn:
    turn = ChatTurn(id=5, conversation_id=1, question="최근 7일 불량률 알려줘")
    turn.created_at = NOW
    turn.updated_at = NOW
    turn.query_scope = query_scope
    return turn


def make_conversation() -> Conversation:
    conversation = Conversation(id=1, owner_id=1, title="불량률")
    conversation.created_at = NOW
    conversation.updated_at = NOW
    conversation.deleted_at = None
    return conversation


def make_actor() -> AppUser:
    return AppUser(
        id=1,
        employee_no="E001",
        display_name="사용자",
        password_hash="unused",
        role="worker",
        must_change_password=False,
        shift_start_local=datetime(2026, 1, 1, 9, 0).time(),
        shift_end_local=datetime(2026, 1, 1, 18, 0).time(),
        version=1,
    )


def build_service() -> tuple[ChatGenerationService, MagicMock, dict[str, MagicMock], MagicMock]:
    session = MagicMock(spec=Session)
    ai_client = MagicMock(spec=OpenAiCompatibleClient)
    service = ChatGenerationService(session, ai_client, lease_seconds=300, clock=lambda: NOW)
    mocks = {
        "job_service": MagicMock(),
        "job_repository": MagicMock(),
        "conversation_repository": MagicMock(),
        "tools": MagicMock(),
    }
    service._job_service = cast(ReportJobService, mocks["job_service"])
    service._job_repository = cast(ReportJobRepository, mocks["job_repository"])
    service._conversation_repository = cast(
        ConversationRepository, mocks["conversation_repository"]
    )
    service._tools = cast(ChatToolExecutor, mocks["tools"])
    return service, ai_client, mocks, session


def prepare_success(
    service: ChatGenerationService,
    ai_client: MagicMock,
    mocks: dict[str, MagicMock],
    session: MagicMock,
) -> tuple[GenerationJob, ChatTurn]:
    job = make_job()
    turn = make_turn()
    mocks["job_service"].claim_next_job.return_value = job
    mocks["conversation_repository"].find_turn_by_active_job.return_value = turn
    mocks["conversation_repository"].find_conversation.return_value = make_conversation()
    session.get.return_value = make_actor()
    mocks["tools"].execute.return_value = ChatQueryResult(
        tool="quality_summary",
        data={"status": "ok", "defect_rate_percent": "10.00"},
        scope={"tool": "quality_summary", "period": {"from": "2026-11-18", "to": "2026-11-24"}},
        evidence=[EvidenceSource(inspection_record_id=5)],
        is_demo=True,
    )
    mocks["job_service"].transition_job.side_effect = lambda job_id, state: setattr(
        job, "state", state
    )
    mocks["job_repository"].lock_job.return_value = job
    mocks["job_repository"].find_job.return_value = job
    return job, turn


def test_process_next_plans_queries_and_publishes_answer() -> None:
    service, ai_client, mocks, session = build_service()
    job, turn = prepare_success(service, ai_client, mocks, session)
    ai_client.generate_markdown.side_effect = lambda *, system_prompt, user_prompt: (
        '{"tool": "quality_summary", "arguments": {"days": 7}}'
        if "조회 계획" in system_prompt
        else "최근 7일 불량률은 10.00%입니다. (시연 데이터 포함)"
    )

    result = service.process_next()

    assert result is not None
    assert result.state == "succeeded"
    assert result.turn_id == 5
    assert job.state == "succeeded"
    assert turn.answer == "최근 7일 불량률은 10.00%입니다. (시연 데이터 포함)"
    assert turn.answered_at == NOW
    assert turn.is_demo is True
    assert turn.query_scope is not None
    assert turn.query_scope["plan"]["tool"] == "quality_summary"
    assert turn.query_scope["scope"]["tool"] == "quality_summary"
    added = mocks["conversation_repository"].add_evidence.call_args.args[0]
    assert isinstance(added, AnswerEvidence)
    assert added.inspection_record_id == 5
    mocks["job_service"].transition_job.assert_called_once_with(7, "writing")
    mocks["job_service"].claim_next_job.assert_called_once_with(kind="chat", lease_seconds=300)
    assert mocks["job_service"].heartbeat_job.call_count == 2
    assert mocks["job_service"].heartbeat_job.call_args.kwargs == {"lease_seconds": 300}
    session.commit.assert_called_once_with()
    assert ai_client.generate_markdown.call_count == 2
    assert "employee_no" not in ai_client.generate_markdown.call_args_list[1].kwargs["user_prompt"]


def test_process_next_reuses_stored_plan_for_latest_requery() -> None:
    service, ai_client, mocks, session = build_service()
    _job, turn = prepare_success(service, ai_client, mocks, session)
    turn.query_scope = {"plan": {"tool": "report_search", "arguments": {"query": "품질"}}}
    ai_client.generate_markdown.return_value = "관련 보고서는 1건입니다."

    result = service.process_next()

    assert result is not None
    assert result.state == "succeeded"
    assert ai_client.generate_markdown.call_count == 1
    assert mocks["job_service"].heartbeat_job.call_count == 1
    plan = mocks["tools"].execute.call_args.args[0]
    assert plan.tool == "report_search"
    assert plan.arguments == {"query": "품질"}


def test_process_next_retries_planner_once_then_succeeds() -> None:
    service, ai_client, mocks, session = build_service()
    _, turn = prepare_success(service, ai_client, mocks, session)
    responses = iter(
        [
            "설명만 출력",
            '{"tool": "quality_summary", "arguments": {"days": 7}}',
            "정상 답변",
        ]
    )
    ai_client.generate_markdown.side_effect = lambda **kwargs: next(responses)

    result = service.process_next()

    assert result is not None
    assert result.state == "succeeded"
    assert ai_client.generate_markdown.call_count == 3
    assert mocks["job_service"].heartbeat_job.call_count == 3
    assert turn.answer == "정상 답변"


def test_process_next_fails_when_planner_keeps_returning_invalid_json() -> None:
    service, ai_client, mocks, session = build_service()
    _, turn = prepare_success(service, ai_client, mocks, session)
    ai_client.generate_markdown.return_value = "not a plan"

    result = service.process_next()

    assert result is not None
    assert result.state == "failed"
    assert turn.answer is None
    mocks["tools"].execute.assert_not_called()
    mocks["job_service"].fail_job.assert_called_once_with(
        7,
        error_code="CHAT_PLAN_FAILED",
        safe_error_message=(
            "질문을 조회 조건으로 해석하지 못했습니다. 기간·제품·설비를 넣어 다시 질문해 주세요."
        ),
    )


def test_process_next_marks_answer_generation_failure() -> None:
    service, ai_client, mocks, session = build_service()
    _, turn = prepare_success(service, ai_client, mocks, session)

    def generate(*, system_prompt: str, user_prompt: str) -> str:
        if "조회 계획" in system_prompt:
            return '{"tool": "quality_summary", "arguments": {"days": 7}}'
        raise AiGenerationError("provider detail")

    ai_client.generate_markdown.side_effect = generate

    result = service.process_next()

    assert result is not None
    assert result.state == "failed"
    assert turn.answer is None
    mocks["job_service"].fail_job.assert_called_once_with(
        7,
        error_code="AI_GENERATION_FAILED",
        safe_error_message="AI 답변 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    )


def test_process_next_discards_answer_when_job_was_cancelled() -> None:
    service, ai_client, mocks, session = build_service()
    job, turn = prepare_success(service, ai_client, mocks, session)

    def generate(*, system_prompt: str, user_prompt: str) -> str:
        if "조회 계획" in system_prompt:
            return '{"tool": "quality_summary", "arguments": {"days": 7}}'
        job.state = "cancelled"
        return "늦게 도착한 답변"

    ai_client.generate_markdown.side_effect = generate

    result = service.process_next()

    assert result is not None
    assert result.state == "cancelled"
    assert turn.answer is None
    mocks["conversation_repository"].add_evidence.assert_not_called()
    session.rollback.assert_called_once_with()


def test_process_next_fails_when_turn_is_missing() -> None:
    service, _, mocks, _ = build_service()
    mocks["job_service"].claim_next_job.return_value = make_job()
    mocks["conversation_repository"].find_turn_by_active_job.return_value = None

    result = service.process_next()

    assert result is not None
    assert result.state == "failed"
    assert result.turn_id is None
    mocks["job_service"].fail_job.assert_called_once()
    assert mocks["job_service"].fail_job.call_args.kwargs["error_code"] == "CHAT_TURN_MISSING"


def test_process_next_returns_none_when_queue_is_empty() -> None:
    service, _, mocks, _ = build_service()
    mocks["job_service"].claim_next_job.return_value = None

    assert service.process_next() is None
