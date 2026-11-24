from datetime import UTC, date, datetime, time
from unittest.mock import MagicMock

from app.core.config import Settings
from app.dependencies.auth import get_current_user
from app.main import create_app
from app.models.conversation import AnswerEvidence, ChatTurn, Conversation
from app.models.master import AppUser
from app.models.report_job import GenerationJob
from app.repositories.conversation import ConversationSummary
from app.routers.conversation import get_conversation_service
from app.services.conversation import (
    ChatTurnInProgressError,
    ChatTurnNotFoundError,
    ChatTurnNotRetryableError,
    ConversationNotFoundError,
    ConversationPage,
    ConversationService,
    ConversationView,
    TurnView,
)
from app.services.report_job import RequestKeyConflictError, request_digest
from fastapi import FastAPI
from fastapi.testclient import TestClient

NOW = datetime(2026, 11, 24, 6, 0, tzinfo=UTC)
TURN_PAYLOAD: dict[str, object] = {
    "conversation_id": 1,
    "question": "최근 검사 불량률 알려줘",
    "refresh_of_turn_id": None,
}


def make_settings() -> Settings:
    return Settings(
        _env_file=None,
        database_url="postgresql+psycopg://user:password@localhost/database",
        jwt_secret="test-secret-that-is-at-least-32-characters",
    )


def make_user() -> AppUser:
    return AppUser(
        id=1,
        employee_no="E001",
        display_name="사용자",
        password_hash="unused",
        role="worker",
        must_change_password=False,
        shift_start_local=time(9, 0),
        shift_end_local=time(18, 0),
        version=1,
    )


def make_conversation() -> Conversation:
    conversation = Conversation(id=1, owner_id=1, title="최근 검사 불량률")
    conversation.created_at = NOW
    conversation.updated_at = NOW
    conversation.deleted_at = None
    return conversation


def make_turn() -> ChatTurn:
    turn = ChatTurn(id=5, conversation_id=1, question="최근 검사 불량률 알려줘")
    turn.answer = "검사 불량률은 2.42%입니다."
    turn.answered_at = NOW
    turn.created_at = NOW
    turn.updated_at = NOW
    turn.data_cutoff_at = NOW
    turn.is_demo = True
    return turn


def make_job(state: str = "succeeded") -> GenerationJob:
    job = GenerationJob(
        id=10,
        requester_id=1,
        kind="chat",
        client_request_key="key-1",
        request_payload=TURN_PAYLOAD,
        request_digest=request_digest(TURN_PAYLOAD),
        state=state,
        accepted_at=NOW,
        data_cutoff_at=NOW,
        finished_at=NOW,
        attempt_count=1,
    )
    return job


def make_application(service: ConversationService | None = None) -> FastAPI:
    application = create_app(
        settings=make_settings(),
        migration_checker=lambda engine, path: None,
    )
    application.dependency_overrides[get_current_user] = make_user
    if service is not None:
        application.dependency_overrides[get_conversation_service] = lambda: service
    return application


def with_csrf(client: TestClient) -> dict[str, str]:
    settings = make_settings()
    client.cookies.set(settings.csrf_cookie_name, "csrf-token")
    return {"X-CSRF-Token": "csrf-token"}


def test_conversations_require_authentication() -> None:
    application = create_app(settings=make_settings(), migration_checker=lambda engine, path: None)

    with TestClient(application) as client:
        response = client.get("/api/v1/conversations")

    assert response.status_code == 401
    assert response.json()["code"] == "AUTHENTICATION_REQUIRED"


def test_create_conversation_requires_csrf_and_returns_detail() -> None:
    service = MagicMock(spec=ConversationService)
    service.create_conversation.return_value = make_conversation()
    application = make_application(service)

    with TestClient(application) as client:
        missing_csrf = client.post("/api/v1/conversations", json={"title": "최근 검사 불량률"})
        headers = with_csrf(client)
        created = client.post(
            "/api/v1/conversations", json={"title": "최근 검사 불량률"}, headers=headers
        )

    assert missing_csrf.status_code == 403
    assert created.status_code == 201
    assert created.headers["cache-control"] == "no-store"
    assert created.json() == {
        "conversation_id": 1,
        "title": "최근 검사 불량률",
        "turn_count": 0,
        "created_at": "2026-11-24T06:00:00Z",
        "updated_at": "2026-11-24T06:00:00Z",
        "turns": [],
    }
    service.create_conversation.assert_called_once()
    assert service.create_conversation.call_args.kwargs["title"] == "최근 검사 불량률"


def test_list_conversations_returns_pagination_and_passes_filters() -> None:
    service = MagicMock(spec=ConversationService)
    service.list_conversations.return_value = ConversationPage(
        conversations=[ConversationSummary(conversation=make_conversation(), turn_count=3)],
        total_items=21,
    )
    application = make_application(service)

    with TestClient(application) as client:
        response = client.get(
            "/api/v1/conversations",
            params={
                "q": "RG3",
                "from": "2026-11-01",
                "to": "2026-11-24",
                "page": 3,
                "page_size": 5,
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["items"][0]["turn_count"] == 3
    assert body["pagination"] == {
        "page": 3,
        "page_size": 5,
        "total_items": 21,
        "total_pages": 5,
    }
    kwargs = service.list_conversations.call_args.kwargs
    assert kwargs["query"] == "RG3"
    assert kwargs["date_from"] == date(2026, 11, 1)
    assert kwargs["date_to"] == date(2026, 11, 24)
    assert kwargs["page"] == 3
    assert kwargs["page_size"] == 5


def test_list_conversations_rejects_reversed_period() -> None:
    service = MagicMock(spec=ConversationService)
    application = make_application(service)

    with TestClient(application) as client:
        response = client.get(
            "/api/v1/conversations", params={"from": "2026-11-24", "to": "2026-11-01"}
        )

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"
    service.list_conversations.assert_not_called()


def test_read_conversation_returns_turn_job_and_evidence() -> None:
    service = MagicMock(spec=ConversationService)
    service.get_conversation.return_value = ConversationView(
        conversation=make_conversation(),
        turns=[
            TurnView(
                turn=make_turn(),
                job=make_job(),
                evidence=[AnswerEvidence(chat_turn_id=5, report_id=2, source_version=1)],
            )
        ],
    )
    application = make_application(service)

    with TestClient(application) as client:
        response = client.get("/api/v1/conversations/1")

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    body = response.json()
    assert body["turn_count"] == 1
    assert body["turns"][0]["turn_id"] == 5
    assert body["turns"][0]["job"]["state"] == "succeeded"
    assert body["turns"][0]["evidence"][0]["report_id"] == 2


def test_read_conversation_maps_not_found() -> None:
    service = MagicMock(spec=ConversationService)
    service.get_conversation.side_effect = ConversationNotFoundError
    application = make_application(service)

    with TestClient(application) as client:
        response = client.get("/api/v1/conversations/99")

    assert response.status_code == 404
    assert response.json()["code"] == "CONVERSATION_NOT_FOUND"


def test_delete_conversation_requires_csrf_and_returns_no_content() -> None:
    service = MagicMock(spec=ConversationService)
    application = make_application(service)

    with TestClient(application) as client:
        missing_csrf = client.delete("/api/v1/conversations/1")
        headers = with_csrf(client)
        deleted = client.delete("/api/v1/conversations/1", headers=headers)

    assert missing_csrf.status_code == 403
    assert deleted.status_code == 204
    service.delete_conversation.assert_called_once()


def test_create_turn_returns_accepted() -> None:
    service = MagicMock(spec=ConversationService)
    service.submit_turn.return_value = (make_turn(), make_job(state="accepted"))
    application = make_application(service)

    with TestClient(application) as client:
        headers = with_csrf(client)
        response = client.post(
            "/api/v1/conversations/1/turns",
            json={
                "question": "최근 검사 불량률 알려줘",
                "client_request_key": "key-1",
            },
            headers=headers,
        )

    assert response.status_code == 202
    assert response.json() == {
        "conversation_id": 1,
        "turn_id": 5,
        "job_id": 10,
        "state": "accepted",
        "accepted_at": "2026-11-24T06:00:00Z",
        "data_cutoff_at": "2026-11-24T06:00:00Z",
    }
    kwargs = service.submit_turn.call_args.kwargs
    assert kwargs["question"] == "최근 검사 불량률 알려줘"
    assert kwargs["client_request_key"] == "key-1"


def test_create_turn_maps_domain_errors() -> None:
    service = MagicMock(spec=ConversationService)
    application = make_application(service)

    with TestClient(application) as client:
        headers = with_csrf(client)
        service.submit_turn.side_effect = ChatTurnInProgressError
        in_progress = client.post(
            "/api/v1/conversations/1/turns",
            json={"question": "질문", "client_request_key": "key-1"},
            headers=headers,
        )
        service.submit_turn.side_effect = RequestKeyConflictError
        conflict = client.post(
            "/api/v1/conversations/1/turns",
            json={"question": "질문", "client_request_key": "key-1"},
            headers=headers,
        )

    assert in_progress.status_code == 409
    assert in_progress.json()["code"] == "CHAT_TURN_IN_PROGRESS"
    assert conflict.status_code == 409
    assert conflict.json()["code"] == "REQUEST_KEY_CONFLICT"


def test_create_turn_validates_blank_question() -> None:
    service = MagicMock(spec=ConversationService)
    application = make_application(service)

    with TestClient(application) as client:
        headers = with_csrf(client)
        response = client.post(
            "/api/v1/conversations/1/turns",
            json={"question": "   ", "client_request_key": "key-1"},
            headers=headers,
        )

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"
    service.submit_turn.assert_not_called()


def test_refresh_turn_returns_accepted_and_maps_missing_turn() -> None:
    service = MagicMock(spec=ConversationService)
    refreshed = ChatTurn(id=7, conversation_id=1, question="최근 검사 불량률 알려줘")
    refreshed.created_at = NOW
    refreshed.updated_at = NOW
    service.refresh_turn.return_value = (refreshed, make_job(state="accepted"))
    application = make_application(service)

    with TestClient(application) as client:
        headers = with_csrf(client)
        response = client.post(
            "/api/v1/conversations/1/turns/5/refresh",
            json={"client_request_key": "key-2"},
            headers=headers,
        )
        service.refresh_turn.side_effect = ChatTurnNotFoundError
        missing = client.post(
            "/api/v1/conversations/1/turns/99/refresh",
            json={"client_request_key": "key-3"},
            headers=headers,
        )

    assert response.status_code == 202
    assert response.json()["turn_id"] == 7
    assert service.refresh_turn.call_args_list[0].kwargs["client_request_key"] == "key-2"
    assert missing.status_code == 404
    assert missing.json()["code"] == "CHAT_TURN_NOT_FOUND"


def test_retry_turn_returns_accepted_and_maps_errors() -> None:
    service = MagicMock(spec=ConversationService)
    retried_turn = ChatTurn(id=5, conversation_id=1, question="최근 검사 불량률 알려줘")
    retried_turn.created_at = NOW
    retried_turn.updated_at = NOW
    service.retry_turn.return_value = (retried_turn, make_job(state="accepted"))
    application = make_application(service)

    with TestClient(application) as client:
        headers = with_csrf(client)
        accepted = client.post(
            "/api/v1/conversations/1/turns/5/retry",
            json={"client_request_key": "key-4"},
            headers=headers,
        )
        service.retry_turn.side_effect = ChatTurnNotRetryableError
        rejected = client.post(
            "/api/v1/conversations/1/turns/5/retry",
            json={"client_request_key": "key-5"},
            headers=headers,
        )
        service.retry_turn.side_effect = ChatTurnNotFoundError
        missing = client.post(
            "/api/v1/conversations/1/turns/99/retry",
            json={"client_request_key": "key-6"},
            headers=headers,
        )

    assert accepted.status_code == 202
    assert accepted.json()["turn_id"] == 5
    assert service.retry_turn.call_args_list[0].kwargs["client_request_key"] == "key-4"
    assert rejected.status_code == 409
    assert rejected.json()["code"] == "CHAT_TURN_NOT_RETRYABLE"
    assert missing.status_code == 404
    assert missing.json()["code"] == "CHAT_TURN_NOT_FOUND"
