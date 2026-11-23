from datetime import UTC, datetime, time
from unittest.mock import MagicMock

from app.core.config import Settings
from app.dependencies.auth import get_current_user
from app.main import create_app
from app.models.handover import HandoverNote, HandoverRead, HandoverTarget
from app.models.master import AppUser
from app.repositories.handover import (
    HandoverNoteRow,
    HandoverReadRow,
    HandoverTargetRow,
)
from app.routers.handover import get_handover_service
from app.services.handover import (
    HandoverForbiddenError,
    HandoverNotFoundError,
    HandoverPage,
    HandoverService,
    HandoverVersionConflictError,
    InvalidHandoverError,
)
from fastapi import FastAPI
from fastapi.testclient import TestClient

NOW = datetime(2026, 11, 23, 10, 0, tzinfo=UTC)


def make_settings() -> Settings:
    return Settings(
        _env_file=None,
        database_url="postgresql+psycopg://user:password@localhost/database",
        jwt_secret="test-secret-that-is-at-least-32-characters",
    )


def make_user(user_id: int = 1, role: str = "worker") -> AppUser:
    return AppUser(
        id=user_id,
        employee_no=f"E{user_id:03d}",
        display_name="사용자",
        password_hash="unused",
        role=role,
        must_change_password=False,
        shift_start_local=time(9, 0),
        shift_end_local=time(18, 0),
        version=1,
    )


def make_note_row() -> HandoverNoteRow:
    note = HandoverNote(
        id=1,
        author_id=1,
        body="야간 점검 완료",
        version=1,
        created_at=NOW,
        updated_at=NOW,
    )
    return HandoverNoteRow(note=note, author_display_name="사용자")


def make_target_row() -> HandoverTargetRow:
    return HandoverTargetRow(
        target=HandoverTarget(id=1, handover_note_id=1, department_id=3),
        code="D1",
        name="생산1부",
    )


def make_read_row() -> HandoverReadRow:
    return HandoverReadRow(
        read=HandoverRead(id=1, handover_note_id=1, user_id=1, confirmed_at=NOW),
        display_name="사용자",
    )


def make_application(service: HandoverService | None = None) -> FastAPI:
    application = create_app(
        settings=make_settings(),
        migration_checker=lambda engine, path: None,
    )
    application.dependency_overrides[get_current_user] = make_user
    if service is not None:
        application.dependency_overrides[get_handover_service] = lambda: service
    return application


def with_csrf(client: TestClient) -> dict[str, str]:
    settings = make_settings()
    client.cookies.set(settings.csrf_cookie_name, "csrf-token")
    return {"X-CSRF-Token": "csrf-token"}


def test_handover_requires_authentication() -> None:
    application = create_app(settings=make_settings(), migration_checker=lambda engine, path: None)

    with TestClient(application) as client:
        response = client.get("/api/v1/handover-notes")

    assert response.status_code == 401
    assert response.json()["code"] == "AUTHENTICATION_REQUIRED"


def test_list_handover_notes_returns_targets_and_confirmation() -> None:
    service = MagicMock(spec=HandoverService)
    service.list_notes.return_value = HandoverPage(
        notes=[make_note_row()],
        targets={1: [make_target_row()]},
        confirmed_counts={1: 2},
        my_reads={1: NOW},
        total_items=1,
    )
    application = make_application(service)

    with TestClient(application) as client:
        response = client.get("/api/v1/handover-notes", params={"q": "점검"})

    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["note_id"] == 1
    assert item["body"] == "야간 점검 완료"
    assert item["targets"] == [
        {"kind": "department", "target_id": 3, "code": "D1", "name": "생산1부"}
    ]
    assert item["confirmed_count"] == 2
    assert item["my_confirmed_at"] == "2026-11-23T10:00:00Z"
    args, kwargs = service.list_notes.call_args
    assert args[0].id == 1
    assert kwargs == {
        "body_query": "점검",
        "target_kind": None,
        "target_id": None,
        "include_all": False,
        "page": 1,
        "page_size": 10,
    }


def test_list_handover_notes_rejects_multiple_filters() -> None:
    service = MagicMock(spec=HandoverService)
    application = make_application(service)

    with TestClient(application) as client:
        response = client.get(
            "/api/v1/handover-notes", params={"department_id": 1, "equipment_id": 2}
        )

    assert response.status_code == 422
    service.list_notes.assert_not_called()


def test_create_handover_note_uses_default_targets_when_omitted() -> None:
    service = MagicMock(spec=HandoverService)
    service.create_note.return_value = 1
    service.get_note.return_value = (make_note_row(), [make_target_row()], [], None)
    application = make_application(service)

    with TestClient(application) as client:
        headers = with_csrf(client)
        response = client.post(
            "/api/v1/handover-notes", json={"body": " 점검 완료 "}, headers=headers
        )

    assert response.status_code == 201
    assert response.json()["note_id"] == 1
    assert response.json()["confirmations"] == []
    kwargs = service.create_note.call_args.kwargs
    assert kwargs["body"] == " 점검 완료 "
    assert kwargs["targets"] is None


def test_create_handover_note_passes_explicit_targets() -> None:
    service = MagicMock(spec=HandoverService)
    service.create_note.return_value = 1
    service.get_note.return_value = (make_note_row(), [], [], None)
    application = make_application(service)

    with TestClient(application) as client:
        headers = with_csrf(client)
        client.post(
            "/api/v1/handover-notes",
            json={"body": "본문", "targets": [{"kind": "equipment", "id": 4}]},
            headers=headers,
        )

    assert service.create_note.call_args.kwargs["targets"] == [("equipment", 4)]


def test_create_handover_note_validates_targets() -> None:
    service = MagicMock(spec=HandoverService)
    application = make_application(service)

    with TestClient(application) as client:
        headers = with_csrf(client)
        duplicate = client.post(
            "/api/v1/handover-notes",
            json={
                "body": "본문",
                "targets": [
                    {"kind": "department", "id": 1},
                    {"kind": "department", "id": 1},
                ],
            },
            headers=headers,
        )
        blank = client.post("/api/v1/handover-notes", json={"body": "   "}, headers=headers)

    assert duplicate.status_code == 422
    assert blank.status_code == 422
    service.create_note.assert_not_called()


def test_handover_detail_returns_not_found() -> None:
    service = MagicMock(spec=HandoverService)
    service.get_note.side_effect = HandoverNotFoundError
    application = make_application(service)

    with TestClient(application) as client:
        response = client.get("/api/v1/handover-notes/1")

    assert response.status_code == 404
    assert response.json()["code"] == "HANDOVER_NOT_FOUND"


def test_handover_update_maps_domain_errors() -> None:
    application = make_application(MagicMock(spec=HandoverService))

    with TestClient(application) as client:
        headers = with_csrf(client)
        cases = [
            (HandoverForbiddenError(), 403, "FORBIDDEN"),
            (HandoverVersionConflictError(3), 409, "VERSION_CONFLICT"),
            (InvalidHandoverError(), 422, "VALIDATION_ERROR"),
            (HandoverNotFoundError(), 404, "HANDOVER_NOT_FOUND"),
        ]
        for error, expected_status, expected_code in cases:
            service = MagicMock(spec=HandoverService)
            service.update_note.side_effect = error
            application.dependency_overrides[get_handover_service] = lambda s=service: s
            response = client.patch(
                "/api/v1/handover-notes/1", json={"version": 1, "body": "수정"}, headers=headers
            )
            assert response.status_code == expected_status
            assert response.json()["code"] == expected_code


def test_handover_delete_requires_expected_version() -> None:
    service = MagicMock(spec=HandoverService)
    application = make_application(service)

    with TestClient(application) as client:
        headers = with_csrf(client)
        missing = client.delete("/api/v1/handover-notes/1", headers=headers)
        deleted = client.delete("/api/v1/handover-notes/1?expected_version=1", headers=headers)

    assert missing.status_code == 422
    assert deleted.status_code == 204
    args, kwargs = service.delete_note.call_args
    assert args[1] == 1
    assert kwargs == {"expected_version": 1}


def test_handover_confirmation_returns_record() -> None:
    service = MagicMock(spec=HandoverService)
    service.confirm_note.return_value = HandoverRead(
        id=1, handover_note_id=1, user_id=1, confirmed_at=NOW
    )
    application = make_application(service)

    with TestClient(application) as client:
        headers = with_csrf(client)
        response = client.put("/api/v1/handover-notes/1/confirmation", headers=headers)

    assert response.status_code == 200
    assert response.json() == {
        "note_id": 1,
        "user_id": 1,
        "confirmed_at": "2026-11-23T10:00:00Z",
    }
    assert response.headers["cache-control"] == "no-store"
