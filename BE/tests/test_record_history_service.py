from datetime import UTC, date, datetime
from decimal import Decimal
from unittest.mock import MagicMock

import pytest
from app.models.master import Equipment, Product
from app.models.process import InspectionRecord, ProcessRecord
from app.repositories.record_history import (
    InspectionRecordView,
    ProcessRecordView,
    RecordHistoryRepository,
)
from app.services.record_history import (
    RecordHistoryService,
    RecordNotFoundError,
    period_bounds,
)

NOW = datetime(2026, 11, 20, 3, 0, tzinfo=UTC)


def make_view(record_id: int = 1) -> ProcessRecordView:
    equipment = Equipment(id=20, equipment_code="S01", name="사출기 1")
    product = Product(id=30, product_code=None, name="시연 제품")
    record = ProcessRecord(
        id=record_id,
        source_import_id=10,
        source_row_number=1,
        equipment_id=20,
        product_id=30,
        occurred_at=NOW,
        available_at=NOW,
        cycle_time_seconds=Decimal("12.345"),
        source_namespace="test",
        source_record_key=f"row-{record_id}",
        source_payload={"_id": f"row-{record_id}"},
        is_demo=True,
        version=1,
    )
    return ProcessRecordView(record=record, equipment=equipment, product=product)


def test_period_bounds_converts_korean_dates_to_utc_window() -> None:
    start, end = period_bounds(date(2026, 11, 20), date(2026, 11, 20))

    assert start == datetime(2026, 11, 19, 15, 0, tzinfo=UTC)
    assert end == datetime(2026, 11, 20, 15, 0, tzinfo=UTC)


def test_period_bounds_keeps_open_ends() -> None:
    assert period_bounds(None, None) == (None, None)
    assert period_bounds(date(2026, 11, 20), None) == (
        datetime(2026, 11, 19, 15, 0, tzinfo=UTC),
        None,
    )
    assert period_bounds(None, date(2026, 11, 20)) == (
        None,
        datetime(2026, 11, 20, 15, 0, tzinfo=UTC),
    )


def test_list_process_records_applies_period_and_pagination() -> None:
    repository = MagicMock(spec=RecordHistoryRepository)
    repository.count_process_records.return_value = 1
    repository.find_process_records.return_value = [make_view()]
    service = RecordHistoryService(repository)

    result = service.list_process_records(
        equipment_id=20,
        product_id=None,
        date_from=date(2026, 11, 20),
        date_to=None,
        page=2,
        page_size=10,
    )

    assert result.total_items == 1
    assert result.records[0].record.id == 1
    repository.count_process_records.assert_called_once_with(
        equipment_id=20,
        product_id=None,
        period_from=datetime(2026, 11, 19, 15, 0, tzinfo=UTC),
        period_to=None,
    )
    repository.find_process_records.assert_called_once_with(
        equipment_id=20,
        product_id=None,
        period_from=datetime(2026, 11, 19, 15, 0, tzinfo=UTC),
        period_to=None,
        offset=10,
        limit=10,
    )


def make_inspection_view(record_id: int = 1) -> InspectionRecordView:
    equipment = Equipment(id=20, equipment_code="S01", name="사출기 1")
    product = Product(id=30, product_code="P-1", name="시연 제품")
    record = InspectionRecord(
        id=record_id,
        equipment_id=20,
        product_id=30,
        process_record_id=5,
        inspected_at=NOW,
        available_at=NOW,
        verdict="defect",
        defect_type="scratch",
        reason="표면 긁힘",
        is_demo=True,
        version=1,
    )
    return InspectionRecordView(record=record, equipment=equipment, product=product)


def test_list_inspection_records_applies_verdict_and_pagination() -> None:
    repository = MagicMock(spec=RecordHistoryRepository)
    repository.count_inspection_records.return_value = 2
    repository.find_inspection_records.return_value = [make_inspection_view()]
    service = RecordHistoryService(repository)

    result = service.list_inspection_records(
        equipment_id=20,
        product_id=30,
        verdict="defect",
        date_from=date(2026, 11, 20),
        date_to=None,
        page=2,
        page_size=10,
    )

    assert result.total_items == 2
    assert result.records[0].record.verdict == "defect"
    expected = {
        "equipment_id": 20,
        "product_id": 30,
        "verdict": "defect",
        "period_from": datetime(2026, 11, 19, 15, 0, tzinfo=UTC),
        "period_to": None,
    }
    repository.count_inspection_records.assert_called_once_with(**expected)
    repository.find_inspection_records.assert_called_once_with(**expected, offset=10, limit=10)


def test_get_inspection_record_handles_missing_record() -> None:
    repository = MagicMock(spec=RecordHistoryRepository)
    repository.find_inspection_record.return_value = make_inspection_view(record_id=9)

    result = RecordHistoryService(repository).get_inspection_record(9)
    assert result.record.id == 9

    repository.find_inspection_record.return_value = None
    with pytest.raises(RecordNotFoundError):
        RecordHistoryService(repository).get_inspection_record(9)


def test_get_process_record_returns_view() -> None:
    repository = MagicMock(spec=RecordHistoryRepository)
    view = make_view(record_id=7)
    repository.find_process_record.return_value = view

    result = RecordHistoryService(repository).get_process_record(7)

    assert result is view
    repository.find_process_record.assert_called_once_with(7)


def test_get_process_record_rejects_missing_record() -> None:
    repository = MagicMock(spec=RecordHistoryRepository)
    repository.find_process_record.return_value = None

    with pytest.raises(RecordNotFoundError):
        RecordHistoryService(repository).get_process_record(7)
