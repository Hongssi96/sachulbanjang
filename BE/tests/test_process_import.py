from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from unittest.mock import MagicMock
from zoneinfo import ZoneInfo

import pytest
from app.commands.import_process_csv import build_parser
from app.repositories.process_import import ProcessImportRepository
from app.services.process_import import (
    ProcessImportError,
    ProcessImportService,
    SourceRecordConflictError,
    build_recent_transform,
    calculate_sha256,
    find_timestamp_range,
    read_process_csv,
)
from sqlalchemy.orm import Session

CSV_HEADER = "_id,TimeStamp,PART_NO,PART_NAME,EQUIP_CD,EQUIP_NAME,Cycle_Time\n"


def write_csv(path: Path, rows: str) -> Path:
    path.write_text(CSV_HEADER + rows, encoding="utf-8")
    return path


def test_read_process_csv_parses_units_and_source_timezone(tmp_path: Path) -> None:
    path = write_csv(
        tmp_path / "process.csv",
        "record-1,2020-01-02 01:01:01,87275Q5000,SP2 LH,S01,1800TON,59.580\n",
    )

    row = next(read_process_csv(path, "Asia/Seoul"))

    assert row.row_number == 1
    assert row.source_record_key == "record-1"
    assert row.product_code == "87275Q5000"
    assert row.cycle_time_seconds == Decimal("59.580")
    assert row.occurred_at.astimezone(UTC).isoformat() == "2020-01-01T16:01:01+00:00"


def test_read_process_csv_keeps_zero_cycle_and_optional_product_code(tmp_path: Path) -> None:
    path = write_csv(
        tmp_path / "process.csv",
        "record-1,2020-01-02 01:01:01,,SP2 LH,S01,1800TON,0\n",
    )

    row = next(read_process_csv(path, "Asia/Seoul"))

    assert row.product_code is None
    assert row.cycle_time_seconds == Decimal(0)


def test_read_process_csv_rejects_missing_headers(tmp_path: Path) -> None:
    path = tmp_path / "invalid.csv"
    path.write_text("_id,TimeStamp\nrecord-1,2020-01-02 01:01:01\n", encoding="utf-8")

    with pytest.raises(ProcessImportError, match="missing required CSV headers"):
        list(read_process_csv(path, "Asia/Seoul"))


def test_find_timestamp_range_returns_earliest_and_latest(tmp_path: Path) -> None:
    path = write_csv(
        tmp_path / "process.csv",
        "record-2,2020-01-02 02:00:00,,SP2 LH,S01,1800TON,60.0\n"
        "record-1,2020-01-02 01:00:00,,SP2 LH,S01,1800TON,59.5\n",
    )

    timestamp_range = find_timestamp_range(path, "Asia/Seoul")

    assert timestamp_range is not None
    earliest, latest = timestamp_range
    assert earliest.astimezone(UTC).isoformat() == "2020-01-01T16:00:00+00:00"
    assert latest.astimezone(UTC).isoformat() == "2020-01-01T17:00:00+00:00"


def test_build_recent_transform_maps_range_into_recent_days() -> None:
    timezone = ZoneInfo("Asia/Seoul")
    start = datetime(2020, 10, 16, 4, 57, 47, tzinfo=timezone)
    end = datetime(2020, 11, 6, 4, 27, 38, tzinfo=timezone)
    now = datetime(2026, 11, 26, 12, 0, tzinfo=timezone)

    transform = build_recent_transform(start, end, now=now, spread_days=14)

    assert transform(start) == datetime(2026, 11, 13, 0, 0, tzinfo=timezone)
    assert transform(end) == now
    assert transform(start) < transform(start + (end - start) / 2) < transform(end)


def test_process_import_spreads_timestamps_when_requested(tmp_path: Path) -> None:
    path = write_csv(
        tmp_path / "process.csv",
        "record-1,2020-01-02 01:01:01,,SP2 LH,S01,1800TON,59.5\n"
        "record-2,2020-01-02 01:02:02,,SP2 LH,S01,1800TON,60.0\n",
    )
    session = MagicMock(spec=Session)
    repository = MagicMock(spec=ProcessImportRepository)
    repository.find_import_by_fingerprint.return_value = None
    repository.find_records_by_source_keys.return_value = {}
    repository.find_equipment.return_value = None
    repository.find_product_by_code.return_value = None
    repository.find_uncoded_products_by_name.return_value = []
    repository.add_import.side_effect = lambda item: setattr(item, "id", 10)
    repository.add_equipment.side_effect = lambda item: setattr(item, "id", 20)
    repository.add_product.side_effect = lambda item: setattr(item, "id", 30)
    fixed_now = datetime(2026, 11, 26, 12, 0, tzinfo=UTC)
    service = ProcessImportService(session, repository, clock=lambda: fixed_now, batch_size=10)

    service.import_file(path, source_timezone="Asia/Seoul", spread_over_days=14)

    records = repository.add_records.call_args.args[0]
    assert records[0].occurred_at.astimezone(UTC) == datetime(2026, 11, 12, 15, 0, tzinfo=UTC)
    assert records[-1].occurred_at.astimezone(UTC) == fixed_now
    assert records[0].source_payload["TimeStamp"] == "2020-01-02 01:01:01"


def test_process_import_publishes_all_records_when_requested(tmp_path: Path) -> None:
    path = write_csv(
        tmp_path / "process.csv",
        "record-1,2020-01-02 01:01:01,,SP2 LH,S01,1800TON,59.5\n"
        "record-2,2020-01-02 01:02:02,,SP2 LH,S01,1800TON,60.0\n",
    )
    session = MagicMock(spec=Session)
    repository = MagicMock(spec=ProcessImportRepository)
    repository.find_import_by_fingerprint.return_value = None
    repository.find_records_by_source_keys.return_value = {}
    repository.find_equipment.return_value = None
    repository.find_product_by_code.return_value = None
    repository.find_uncoded_products_by_name.return_value = []
    repository.add_import.side_effect = lambda item: setattr(item, "id", 10)
    repository.add_equipment.side_effect = lambda item: setattr(item, "id", 20)
    repository.add_product.side_effect = lambda item: setattr(item, "id", 30)
    service = ProcessImportService(session, repository, batch_size=10)

    service.import_file(path, source_timezone="Asia/Seoul", publish_all=True)

    records = repository.add_records.call_args.args[0]
    assert all(record.available_at == record.occurred_at for record in records)
    replay = repository.add_replay.call_args.args[0]
    assert replay.state == "completed"
    assert replay.cursor == 2
    assert replay.data_time == records[-1].occurred_at


def test_process_import_is_atomic_and_creates_resolved_records(tmp_path: Path) -> None:
    path = write_csv(
        tmp_path / "process.csv",
        "record-1,2020-01-02 01:01:01,87275Q5000,SP2 LH,S01,1800TON,59.5\n"
        "record-2,2020-01-02 01:02:01,87275Q5000,SP2 LH,S01,1800TON,60.0\n",
    )
    session = MagicMock(spec=Session)
    repository = MagicMock(spec=ProcessImportRepository)
    repository.find_import_by_fingerprint.return_value = None
    repository.find_records_by_source_keys.return_value = {}
    repository.find_equipment.return_value = None
    repository.find_product_by_code.return_value = None
    repository.find_uncoded_products_by_name.return_value = []
    repository.add_import.side_effect = lambda item: setattr(item, "id", 10)
    repository.add_equipment.side_effect = lambda item: setattr(item, "id", 20)
    repository.add_product.side_effect = lambda item: setattr(item, "id", 30)
    service = ProcessImportService(session, repository, batch_size=10)

    result = service.import_file(path, source_timezone="Asia/Seoul")

    assert result.import_id == 10
    assert result.imported_records == 2
    assert result.created_equipment == 1
    assert result.created_products == 1
    session.begin.assert_called_once_with()
    records = repository.add_records.call_args.args[0]
    assert [record.source_record_key for record in records] == ["record-1", "record-2"]
    assert all(record.equipment_id == 20 for record in records)
    assert all(record.product_id == 30 for record in records)


def test_process_import_rejects_conflicting_keys_in_one_batch(tmp_path: Path) -> None:
    path = write_csv(
        tmp_path / "process.csv",
        "record-1,2020-01-02 01:01:01,,SP2 LH,S01,1800TON,59.5\n"
        "record-1,2020-01-02 01:02:01,,SP2 LH,S01,1800TON,60.0\n",
    )
    session = MagicMock(spec=Session)
    repository = MagicMock(spec=ProcessImportRepository)
    repository.find_import_by_fingerprint.return_value = None
    repository.find_records_by_source_keys.return_value = {}
    repository.find_equipment.return_value = None
    repository.find_uncoded_products_by_name.return_value = []
    repository.add_import.side_effect = lambda item: setattr(item, "id", 10)
    repository.add_equipment.side_effect = lambda item: setattr(item, "id", 20)
    repository.add_product.side_effect = lambda item: setattr(item, "id", 30)
    service = ProcessImportService(session, repository, batch_size=10)

    with pytest.raises(SourceRecordConflictError, match="different content"):
        service.import_file(path, source_timezone="Asia/Seoul")


def test_calculate_sha256_is_stable(tmp_path: Path) -> None:
    path = tmp_path / "source.csv"
    path.write_bytes(b"molding-data")

    assert calculate_sha256(path) == calculate_sha256(path)


def test_import_command_defaults_source_timezone_to_korea() -> None:
    args = build_parser().parse_args(["process.csv", "--validate-only"])

    assert args.source_timezone == "Asia/Seoul"
