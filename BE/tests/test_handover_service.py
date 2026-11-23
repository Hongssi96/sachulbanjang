from datetime import UTC, datetime, time
from unittest.mock import MagicMock

import pytest
from app.models.handover import HandoverNote, HandoverRead, HandoverTarget
from app.models.master import AppUser, Department
from app.repositories.handover import (
    HandoverNoteRow,
    HandoverRepository,
    HandoverTargetRow,
)
from app.services.handover import (
    HandoverForbiddenError,
    HandoverNotFoundError,
    HandoverService,
    HandoverVersionConflictError,
    InvalidHandoverError,
)
from sqlalchemy.orm import Session

NOW = datetime(2026, 11, 23, 10, 0, tzinfo=UTC)


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


def make_note(note_id: int = 1, *, author_id: int = 1, version: int = 1) -> HandoverNote:
    return HandoverNote(
        id=note_id,
        author_id=author_id,
        body="야간 점검 완료",
        version=version,
        created_at=NOW,
        updated_at=NOW,
    )


def make_note_row(*, author_id: int = 1, version: int = 1) -> HandoverNoteRow:
    return HandoverNoteRow(
        note=make_note(author_id=author_id, version=version), author_display_name="사용자"
    )


def make_target_row(note_id: int = 1, department_id: int = 3) -> HandoverTargetRow:
    return HandoverTargetRow(
        target=HandoverTarget(id=1, handover_note_id=note_id, department_id=department_id),
        code="D1",
        name="생산1부",
    )


def build_service() -> tuple[HandoverService, MagicMock, MagicMock]:
    session = MagicMock(spec=Session)
    repository = MagicMock(spec=HandoverRepository)
    service = HandoverService(session, repository, clock=lambda: NOW)
    return service, repository, session


def test_create_note_with_explicit_targets() -> None:
    service, repository, session = build_service()
    repository.find_active_department.return_value = Department(id=3, code="D1", name="생산1부")

    note_id = service.create_note(make_user(), body="점검 완료", targets=[("department", 3)])

    note = repository.add_note.call_args.args[0]
    assert note.author_id == 1
    assert note.version == 1
    target = repository.add_target.call_args.args[0]
    assert target.handover_note_id == note_id
    assert target.department_id == 3
    session.commit.assert_called_once_with()


def test_create_note_uses_author_assignments_by_default() -> None:
    service, repository, _ = build_service()
    repository.find_assignment_pairs.return_value = [("production_line", 7)]
    repository.find_active_production_line.return_value = object()

    service.create_note(make_user(), body="기본 담당", targets=None)

    repository.find_assignment_pairs.assert_called_once_with(1)
    assert repository.add_target.call_args.args[0].production_line_id == 7


def test_create_note_rejects_unknown_target() -> None:
    service, repository, session = build_service()
    repository.find_active_equipment.return_value = None

    with pytest.raises(InvalidHandoverError):
        service.create_note(make_user(), body="x", targets=[("equipment", 99)])

    repository.add_note.assert_not_called()
    session.commit.assert_not_called()


def test_list_notes_applies_default_assignment_filter() -> None:
    service, repository, _ = build_service()
    repository.find_assignment_pairs.return_value = [("department", 3)]
    repository.count_notes.return_value = 1
    repository.find_notes.return_value = [make_note_row()]
    repository.find_target_rows.return_value = [make_target_row()]
    repository.count_reads.return_value = {1: 2}
    repository.find_my_reads.return_value = {1: NOW}

    result = service.list_notes(
        make_user(),
        body_query="  점검  ",
        target_kind=None,
        target_id=None,
        include_all=False,
        page=1,
        page_size=10,
    )

    assert result.total_items == 1
    assert result.confirmed_counts == {1: 2}
    assert result.my_reads == {1: NOW}
    assert result.targets[1][0].name == "생산1부"
    repository.count_notes.assert_called_once_with(
        body_query="점검", target_kind=None, target_id=None, assignment_pairs=[("department", 3)]
    )


def test_list_notes_admin_and_explicit_filter_ignore_defaults() -> None:
    service, repository, _ = build_service()
    repository.count_notes.return_value = 0
    repository.find_notes.return_value = []

    service.list_notes(
        make_user(role="admin"),
        body_query=None,
        target_kind=None,
        target_id=None,
        include_all=False,
        page=1,
        page_size=10,
    )
    assert repository.count_notes.call_args.kwargs["assignment_pairs"] == []

    service.list_notes(
        make_user(),
        body_query=None,
        target_kind="equipment",
        target_id=5,
        include_all=False,
        page=1,
        page_size=10,
    )
    assert repository.count_notes.call_args.kwargs["assignment_pairs"] == []
    repository.find_assignment_pairs.assert_not_called()


def test_get_note_returns_targets_reads_and_my_confirmation() -> None:
    service, repository, _ = build_service()
    repository.find_note_row.return_value = make_note_row()
    repository.find_target_rows.return_value = [make_target_row()]
    read = HandoverRead(id=1, handover_note_id=1, user_id=1, confirmed_at=NOW)
    from app.repositories.handover import HandoverReadRow

    repository.list_reads.return_value = {1: [HandoverReadRow(read=read, display_name="사용자")]}
    repository.find_read.return_value = read

    row, targets, reads, my_confirmed_at = service.get_note(make_user(), 1)

    assert row.note.id == 1
    assert len(targets) == 1
    assert len(reads) == 1
    assert my_confirmed_at == NOW


def test_get_note_rejects_missing_note() -> None:
    service, repository, _ = build_service()
    repository.find_note_row.return_value = None

    with pytest.raises(HandoverNotFoundError):
        service.get_note(make_user(), 1)


def test_update_note_is_author_only_and_version_checked() -> None:
    service, repository, session = build_service()
    note = make_note(author_id=2)
    repository.lock_note.return_value = note

    with pytest.raises(HandoverForbiddenError):
        service.update_note(make_user(user_id=1), 1, version=1, body="x", targets=None)
    with pytest.raises(HandoverForbiddenError):
        service.update_note(
            make_user(user_id=9, role="admin"), 1, version=1, body="x", targets=None
        )

    note.author_id = 1
    note.version = 3
    with pytest.raises(HandoverVersionConflictError) as caught:
        service.update_note(make_user(), 1, version=1, body="x", targets=None)
    assert caught.value.current_version == 3

    note.version = 1
    with pytest.raises(InvalidHandoverError):
        service.update_note(make_user(), 1, version=1, body=None, targets=None)
    session.commit.assert_not_called()


def test_update_note_replaces_targets() -> None:
    service, repository, session = build_service()
    repository.lock_note.return_value = make_note(author_id=1)
    repository.find_active_equipment.return_value = object()

    service.update_note(make_user(), 1, version=1, body="수정", targets=[("equipment", 4)])

    repository.delete_targets.assert_called_once_with(1)
    assert repository.add_target.call_args.args[0].equipment_id == 4
    session.commit.assert_called_once_with()


def test_delete_note_permissions() -> None:
    service, repository, session = build_service()
    repository.lock_note.return_value = make_note(author_id=2)

    with pytest.raises(HandoverForbiddenError):
        service.delete_note(make_user(user_id=1), 1, expected_version=1)

    service.delete_note(make_user(user_id=9, role="admin"), 1, expected_version=1)
    assert repository.lock_note.return_value.deleted_at == NOW

    note = make_note(author_id=1, version=4)
    repository.lock_note.return_value = note
    with pytest.raises(HandoverVersionConflictError):
        service.delete_note(make_user(user_id=1), 1, expected_version=1)
    session.commit.assert_called_once_with()


def test_confirm_note_is_idempotent() -> None:
    service, repository, session = build_service()
    repository.find_note.return_value = make_note()
    repository.find_read.return_value = None

    read = service.confirm_note(make_user(), 1)
    assert read.handover_note_id == 1
    assert read.user_id == 1
    assert read.confirmed_at == NOW
    session.commit.assert_called_once_with()

    existing = HandoverRead(id=2, handover_note_id=1, user_id=1, confirmed_at=NOW)
    repository.find_read.return_value = existing
    session.commit.reset_mock()
    assert service.confirm_note(make_user(), 1) is existing
    session.commit.assert_not_called()

    repository.find_note.return_value = None
    with pytest.raises(HandoverNotFoundError):
        service.confirm_note(make_user(), 1)
