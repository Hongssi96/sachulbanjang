from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock

import pytest
from app.models.master import Equipment, Product
from app.models.process import ProcessRecord, ProcessReplay
from app.repositories.process_replay import CurrentProcessRecord, ProcessReplayRepository
from app.services.process_replay import (
    CurrentProcessService,
    ProcessReplayNotFoundError,
    ProcessReplayService,
    derive_replay_display_state,
)
from sqlalchemy.orm import Session

NOW = datetime(2026, 11, 20, 3, 0, tzinfo=UTC)
DATA_TIME = datetime(2020, 1, 1, 16, 0, tzinfo=UTC)


def make_replay(**overrides: object) -> ProcessReplay:
    values: dict[str, object] = {
        "id": 1,
        "source_import_id": 10,
        "cursor": 0,
        "state": "ready",
        "data_time": None,
        "last_advanced_at": None,
    }
    values.update(overrides)
    return ProcessReplay(**values)


def make_record(row_number: int) -> ProcessRecord:
    return ProcessRecord(
        id=row_number,
        source_import_id=10,
        source_row_number=row_number,
        equipment_id=20,
        product_id=30,
        occurred_at=DATA_TIME + timedelta(seconds=row_number),
        available_at=None,
        cycle_time_seconds=None,
        source_namespace="test",
        source_record_key=f"row-{row_number}",
        source_payload={"_id": f"row-{row_number}"},
        is_demo=True,
        version=1,
    )


def make_service(
    replay: ProcessReplay | None, records: list[ProcessRecord | None]
) -> tuple[ProcessReplayService, MagicMock, MagicMock]:
    session = MagicMock(spec=Session)
    repository = MagicMock(spec=ProcessReplayRepository)
    repository.lock_replay.return_value = replay
    repository.find_next_record.side_effect = records
    service = ProcessReplayService(session, repository)
    return service, session, repository


def test_ready_replay_publishes_first_record_immediately() -> None:
    replay = make_replay()
    first = make_record(1)
    second = make_record(2)
    service, session, repository = make_service(replay, [first, second])

    result = service.advance_once(1, now=NOW)

    assert result.advanced
    assert result.state == "running"
    assert result.cursor == 1
    assert result.data_time == first.occurred_at
    assert result.next_due_at == NOW + timedelta(seconds=5)
    assert first.available_at == NOW
    session.begin.assert_called_once_with()
    repository.lock_replay.assert_called_once_with(1)


def test_running_replay_waits_until_five_seconds_elapsed() -> None:
    replay = make_replay(state="running", cursor=1, last_advanced_at=NOW, data_time=DATA_TIME)
    service, _, repository = make_service(replay, [])

    result = service.advance_once(1, now=NOW + timedelta(seconds=4, milliseconds=999))

    assert not result.advanced
    assert result.state == "running"
    repository.find_next_record.assert_not_called()


def test_last_record_is_published_and_replay_completes() -> None:
    replay = make_replay()
    last = make_record(1)
    service, _, _ = make_service(replay, [last, None])

    result = service.advance_once(1, now=NOW)

    assert result.advanced
    assert result.state == "completed"
    assert result.next_due_at is None
    assert last.available_at == NOW


def test_empty_replay_completes_without_advancing() -> None:
    replay = make_replay()
    service, _, _ = make_service(replay, [None])

    result = service.advance_once(1, now=NOW)

    assert not result.advanced
    assert result.state == "completed"
    assert result.last_advanced_at is None


def test_completed_replay_is_not_changed_to_delayed() -> None:
    replay = make_replay(state="completed", last_advanced_at=NOW - timedelta(minutes=10))

    state = derive_replay_display_state(replay, NOW, timedelta(seconds=15))

    assert state == "completed"


def test_running_replay_is_delayed_at_fifteen_seconds() -> None:
    replay = make_replay(state="running", last_advanced_at=NOW - timedelta(seconds=15))

    state = derive_replay_display_state(replay, NOW, timedelta(seconds=15))

    assert state == "delayed"


def test_running_replay_is_not_delayed_before_fifteen_seconds() -> None:
    replay = make_replay(
        state="running",
        last_advanced_at=NOW - timedelta(seconds=14, milliseconds=999),
    )

    state = derive_replay_display_state(replay, NOW, timedelta(seconds=15))

    assert state == "running"


def test_replay_lock_uses_postgresql_for_update() -> None:
    session = MagicMock(spec=Session)
    repository = ProcessReplayRepository(session)

    repository.lock_replay(1)

    statement = session.scalar.call_args.args[0]
    assert "FOR UPDATE" in str(statement)


def test_mark_failed_does_not_override_completed_replay() -> None:
    replay = make_replay(state="completed")
    service, session, repository = make_service(replay, [])

    service.mark_failed(1, "worker_error")

    assert replay.state == "completed"
    assert replay.error_code is None
    session.begin.assert_called_once_with()
    repository.lock_replay.assert_called_once_with(1)


def test_missing_replay_is_rejected() -> None:
    service, _, _ = make_service(None, [])

    with pytest.raises(ProcessReplayNotFoundError, match="was not found"):
        service.advance_once(99, now=NOW)


def test_naive_advance_time_is_rejected() -> None:
    service, _, _ = make_service(make_replay(), [])

    with pytest.raises(ValueError, match="timezone-aware"):
        service.advance_once(1, now=datetime(2026, 11, 20, 3, 0))


def test_current_process_reads_latest_replay_records() -> None:
    replay = make_replay(state="running", last_advanced_at=NOW - timedelta(seconds=5))
    record = make_record(1)
    record.available_at = NOW - timedelta(seconds=5)
    equipment = Equipment(id=20, equipment_code="S01", name="사출기 1")
    product = Product(id=30, product_code="P01", name="제품 1")
    current = CurrentProcessRecord(record=record, equipment=equipment, product=product)
    repository = MagicMock(spec=ProcessReplayRepository)
    repository.find_latest_replay.return_value = replay
    repository.find_current_records.return_value = [current]

    result = CurrentProcessService(repository).get_current(equipment_id=20, queried_at=NOW)

    assert result.replay is replay
    assert result.replay_state == "running"
    assert result.records == [current]
    repository.find_current_records.assert_called_once_with(
        10,
        available_at=NOW,
        equipment_id=20,
    )


def test_current_process_returns_empty_result_without_replay() -> None:
    repository = MagicMock(spec=ProcessReplayRepository)
    repository.find_latest_replay.return_value = None

    result = CurrentProcessService(repository).get_current(queried_at=NOW)

    assert result.replay is None
    assert result.replay_state is None
    assert result.records == []
    repository.find_current_records.assert_not_called()
