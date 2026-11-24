from datetime import UTC, date, datetime, time
from unittest.mock import MagicMock

import pytest
from app.models.conversation import AnswerEvidence, ChatTurn, Conversation
from app.models.master import AppUser
from app.models.report_job import GenerationJob
from app.repositories.conversation import ConversationRepository, ConversationSummary, TurnJobRow
from app.services.conversation import (
    ChatTurnInProgressError,
    ChatTurnNotFoundError,
    ChatTurnNotRetryableError,
    ConversationNotFoundError,
    ConversationService,
)
from app.services.report_job import (
    JobNotCancellableError,
    ReportJobService,
    RequestKeyConflictError,
    request_digest,
)
from sqlalchemy.orm import Session

NOW = datetime(2026, 11, 24, 6, 0, tzinfo=UTC)


def make_user(user_id: int = 1) -> AppUser:
    return AppUser(
        id=user_id,
        employee_no=f"E{user_id:03d}",
        display_name="사용자",
        password_hash="unused",
        role="worker",
        must_change_password=False,
        shift_start_local=time(9, 0),
        shift_end_local=time(18, 0),
        version=1,
    )


def make_conversation(
    conversation_id: int = 1, *, owner_id: int = 1, title: str = "최근 검사 불량률"
) -> Conversation:
    conversation = Conversation(id=conversation_id, owner_id=owner_id, title=title)
    conversation.created_at = NOW
    conversation.updated_at = NOW
    conversation.deleted_at = None
    return conversation


def make_job(
    job_id: int = 10,
    *,
    state: str = "accepted",
    payload: dict[str, object] | None = None,
) -> GenerationJob:
    request_payload = payload or {
        "conversation_id": 1,
        "question": "질문",
        "refresh_of_turn_id": None,
    }
    job = GenerationJob(
        id=job_id,
        requester_id=1,
        kind="chat",
        client_request_key="key-1",
        request_payload=request_payload,
        request_digest=request_digest(request_payload),
        state=state,
        accepted_at=NOW,
        data_cutoff_at=NOW,
        attempt_count=0,
    )
    return job


def make_turn(turn_id: int = 5, *, question: str = "질문") -> ChatTurn:
    turn = ChatTurn(id=turn_id, conversation_id=1, question=question)
    turn.created_at = NOW
    turn.updated_at = NOW
    return turn


def build_service() -> tuple[ConversationService, MagicMock, MagicMock, MagicMock]:
    session = MagicMock(spec=Session)
    repository = MagicMock(spec=ConversationRepository)
    jobs = MagicMock(spec=ReportJobService)
    service = ConversationService(session, repository, jobs, clock=lambda: NOW)
    return service, repository, jobs, session


def test_create_conversation_sets_owner_and_title() -> None:
    service, repository, _, session = build_service()

    conversation = service.create_conversation(make_user(3), title="새 대화")

    assert conversation.owner_id == 3
    assert conversation.title == "새 대화"
    repository.add_conversation.assert_called_once_with(conversation)
    session.commit.assert_called_once_with()


def test_list_conversations_scopes_to_owner_and_paginates() -> None:
    service, repository, _, _ = build_service()
    repository.count_conversations.return_value = 12
    repository.find_conversations.return_value = [
        ConversationSummary(conversation=make_conversation(), turn_count=2)
    ]

    page = service.list_conversations(
        make_user(4),
        query="  RG3  ",
        date_from=date(2026, 11, 1),
        date_to=date(2026, 11, 24),
        page=2,
        page_size=10,
    )

    assert page.total_items == 12
    assert page.conversations[0].turn_count == 2
    kwargs = repository.find_conversations.call_args.kwargs
    assert kwargs["owner_id"] == 4
    assert kwargs["query"] == "RG3"
    assert kwargs["period_from"] is not None
    assert kwargs["period_to"] is not None
    assert kwargs["offset"] == 10
    assert kwargs["limit"] == 10


def test_get_conversation_hides_other_owners_and_groups_evidence() -> None:
    service, repository, _, _ = build_service()
    repository.find_conversation.return_value = make_conversation(owner_id=2)

    with pytest.raises(ConversationNotFoundError):
        service.get_conversation(make_user(1), 1)

    repository.find_conversation.return_value = None
    with pytest.raises(ConversationNotFoundError):
        service.get_conversation(make_user(1), 1)

    turn = make_turn()
    repository.find_conversation.return_value = make_conversation()
    repository.find_turns_with_jobs.return_value = [
        TurnJobRow(turn=turn, job=make_job(state="succeeded"))
    ]
    repository.list_evidence.return_value = [
        AnswerEvidence(chat_turn_id=5, report_id=2, source_version=3)
    ]

    view = service.get_conversation(make_user(1), 1)

    assert view.conversation.id == 1
    assert view.turns[0].job is not None
    assert view.turns[0].job.state == "succeeded"
    assert view.turns[0].evidence[0].report_id == 2
    repository.list_evidence.assert_called_once_with([5])


def test_delete_conversation_soft_deletes_and_cancels_active_job() -> None:
    service, repository, jobs, session = build_service()
    conversation = make_conversation()
    repository.lock_owned_conversation.return_value = conversation
    repository.find_active_job.return_value = make_job(state="writing")

    service.delete_conversation(make_user(1), 1)

    assert conversation.deleted_at == NOW
    jobs.cancel_job.assert_called_once()
    assert jobs.cancel_job.call_args.args[0].id == 1
    assert jobs.cancel_job.call_args.args[1] == 10
    session.commit.assert_not_called()


def test_delete_conversation_commits_when_job_already_finished() -> None:
    service, repository, jobs, session = build_service()
    conversation = make_conversation()
    repository.lock_owned_conversation.return_value = conversation
    repository.find_active_job.return_value = make_job(state="writing")
    jobs.cancel_job.side_effect = JobNotCancellableError

    service.delete_conversation(make_user(1), 1)

    assert conversation.deleted_at == NOW
    session.commit.assert_called_once_with()


def test_delete_conversation_requires_ownership() -> None:
    service, repository, jobs, _ = build_service()
    repository.lock_owned_conversation.return_value = None

    with pytest.raises(ConversationNotFoundError):
        service.delete_conversation(make_user(1), 1)

    jobs.cancel_job.assert_not_called()


def test_submit_turn_creates_turn_and_chat_job_atomically() -> None:
    service, repository, jobs, session = build_service()
    conversation = make_conversation()
    repository.lock_owned_conversation.return_value = conversation
    repository.find_active_job.return_value = None
    jobs.find_request.return_value = None
    job = make_job(payload={"conversation_id": 1, "question": "질문", "refresh_of_turn_id": None})
    jobs.submit_job.return_value = (job, True)

    def add_turn(turn: ChatTurn) -> None:
        turn.id = 7

    repository.add_turn.side_effect = add_turn
    repository.find_turn_by_active_job.return_value = make_turn(7)

    turn, returned = service.submit_turn(
        make_user(1), 1, question="질문", client_request_key="key-1"
    )

    assert turn.id == 7
    assert turn.active_job_id == 10
    assert turn.data_cutoff_at == NOW
    assert conversation.updated_at == NOW
    assert returned is job
    assert jobs.submit_job.call_args.kwargs == {
        "kind": "chat",
        "client_request_key": "key-1",
        "payload": {"conversation_id": 1, "question": "질문", "refresh_of_turn_id": None},
        "commit": False,
    }
    session.commit.assert_called_once_with()


def test_submit_turn_rejects_while_another_answer_is_generating() -> None:
    service, repository, jobs, _ = build_service()
    repository.lock_owned_conversation.return_value = make_conversation()
    repository.find_active_job.return_value = make_job(state="querying")
    jobs.find_request.return_value = None

    with pytest.raises(ChatTurnInProgressError):
        service.submit_turn(make_user(1), 1, question="질문", client_request_key="key-1")

    repository.add_turn.assert_not_called()
    jobs.submit_job.assert_not_called()


def test_submit_turn_reuses_request_key_with_same_payload() -> None:
    service, repository, jobs, _ = build_service()
    repository.lock_owned_conversation.return_value = make_conversation()
    payload: dict[str, object] = {
        "conversation_id": 1,
        "question": "질문",
        "refresh_of_turn_id": None,
    }
    existing = make_job(payload=payload)
    jobs.find_request.return_value = existing
    turn = make_turn(7)
    repository.find_turn_by_active_job.return_value = turn

    reused, returned = service.submit_turn(
        make_user(1), 1, question="질문", client_request_key="key-1"
    )

    assert reused is turn
    assert returned is existing
    repository.add_turn.assert_not_called()
    jobs.submit_job.assert_not_called()


def test_submit_turn_rejects_same_key_with_different_payload() -> None:
    service, repository, jobs, _ = build_service()
    repository.lock_owned_conversation.return_value = make_conversation()
    existing = make_job()
    existing.request_digest = "0" * 64
    jobs.find_request.return_value = existing

    with pytest.raises(RequestKeyConflictError):
        service.submit_turn(make_user(1), 1, question="다른 질문", client_request_key="key-1")

    repository.add_turn.assert_not_called()


def test_submit_turn_requires_owned_conversation() -> None:
    service, repository, jobs, _ = build_service()
    repository.lock_owned_conversation.return_value = None

    with pytest.raises(ConversationNotFoundError):
        service.submit_turn(make_user(1), 1, question="질문", client_request_key="key-1")

    jobs.find_request.assert_not_called()


def test_refresh_turn_keeps_question_and_scope() -> None:
    service, repository, jobs, _ = build_service()
    repository.lock_owned_conversation.return_value = make_conversation()
    original = make_turn(3, question="RG3 RH 검사 기록")
    original.query_scope = {"product_id": 2, "period": "7d"}
    repository.find_turn.return_value = original
    repository.find_active_job.return_value = None
    jobs.find_request.return_value = None
    job = make_job(
        payload={
            "conversation_id": 1,
            "question": "RG3 RH 검사 기록",
            "refresh_of_turn_id": 3,
        }
    )
    jobs.submit_job.return_value = (job, True)

    def add_turn(turn: ChatTurn) -> None:
        turn.id = 9

    repository.add_turn.side_effect = add_turn

    turn, returned = service.refresh_turn(make_user(1), 1, 3, client_request_key="key-2")

    assert turn.id == 9
    assert turn.question == "RG3 RH 검사 기록"
    assert turn.query_scope == {"product_id": 2, "period": "7d"}
    assert returned is job
    assert jobs.submit_job.call_args.kwargs["payload"] == {
        "conversation_id": 1,
        "question": "RG3 RH 검사 기록",
        "refresh_of_turn_id": 3,
    }


def test_refresh_turn_requires_existing_turn_in_conversation() -> None:
    service, repository, _, _ = build_service()
    repository.lock_owned_conversation.return_value = make_conversation()
    repository.find_turn.return_value = None

    with pytest.raises(ChatTurnNotFoundError):
        service.refresh_turn(make_user(1), 1, 99, client_request_key="key-2")

    repository.add_turn.assert_not_called()


def test_retry_turn_attaches_new_job_to_same_turn() -> None:
    service, repository, jobs, session = build_service()
    conversation = make_conversation()
    repository.lock_owned_conversation.return_value = conversation
    turn = make_turn(7)
    turn.active_job_id = 10
    turn.answer = "이전 답변"
    repository.find_turn.return_value = turn
    repository.find_job.return_value = make_job(job_id=10, state="failed")
    repository.find_active_job.return_value = None
    jobs.find_request.return_value = None
    new_job = make_job(
        job_id=11,
        payload={"conversation_id": 1, "question": "질문", "retry_of_turn_id": 7},
    )
    jobs.submit_job.return_value = (new_job, True)

    retried, returned = service.retry_turn(make_user(1), 1, 7, client_request_key="key-2")

    assert retried is turn
    assert returned is new_job
    assert turn.active_job_id == 11
    assert turn.answer is None
    assert turn.answered_at is None
    assert jobs.submit_job.call_args.kwargs["payload"] == {
        "conversation_id": 1,
        "question": "질문",
        "retry_of_turn_id": 7,
    }
    repository.add_turn.assert_not_called()
    session.commit.assert_called_once_with()


def test_retry_turn_requires_failed_or_interrupted_job() -> None:
    service, repository, jobs, _ = build_service()
    repository.lock_owned_conversation.return_value = make_conversation()
    turn = make_turn(7)
    turn.active_job_id = 10
    repository.find_turn.return_value = turn
    repository.find_job.return_value = make_job(job_id=10, state="succeeded")
    jobs.find_request.return_value = None

    with pytest.raises(ChatTurnNotRetryableError):
        service.retry_turn(make_user(1), 1, 7, client_request_key="key-2")

    jobs.submit_job.assert_not_called()

    repository.find_job.return_value = None
    with pytest.raises(ChatTurnNotRetryableError):
        service.retry_turn(make_user(1), 1, 7, client_request_key="key-3")


def test_retry_turn_reuses_same_request_key_idempotently() -> None:
    service, repository, jobs, _ = build_service()
    repository.lock_owned_conversation.return_value = make_conversation()
    turn = make_turn(7)
    turn.active_job_id = 11
    repository.find_turn.return_value = turn
    payload = {"conversation_id": 1, "question": "질문", "retry_of_turn_id": 7}
    existing = make_job(job_id=11, payload=payload)
    existing.request_digest = request_digest(payload)
    jobs.find_request.return_value = existing
    repository.find_turn_by_active_job.return_value = turn

    reused, returned = service.retry_turn(make_user(1), 1, 7, client_request_key="key-2")

    assert reused is turn
    assert returned is existing
    jobs.submit_job.assert_not_called()
    repository.find_job.assert_not_called()


def test_retry_turn_requires_existing_turn_in_conversation() -> None:
    service, repository, _, _ = build_service()
    repository.lock_owned_conversation.return_value = make_conversation()
    repository.find_turn.return_value = None

    with pytest.raises(ChatTurnNotFoundError):
        service.retry_turn(make_user(1), 1, 99, client_request_key="key-2")


def test_retry_turn_rejects_while_another_turn_is_generating() -> None:
    service, repository, jobs, _ = build_service()
    repository.lock_owned_conversation.return_value = make_conversation()
    turn = make_turn(7)
    turn.active_job_id = 10
    repository.find_turn.return_value = turn
    repository.find_job.return_value = make_job(job_id=10, state="failed")
    repository.find_active_job.return_value = make_job(job_id=12, state="querying")
    jobs.find_request.return_value = None

    with pytest.raises(ChatTurnInProgressError):
        service.retry_turn(make_user(1), 1, 7, client_request_key="key-2")

    jobs.submit_job.assert_not_called()
