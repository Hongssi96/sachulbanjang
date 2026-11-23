from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.repositories.record_history import (
    InspectionRecordView,
    ProcessRecordView,
    RecordHistoryRepository,
)

SEOUL = ZoneInfo("Asia/Seoul")


class RecordNotFoundError(Exception):
    """Raised when a record does not exist or is soft-deleted."""


@dataclass(frozen=True)
class ProcessRecordPage:
    records: list[ProcessRecordView]
    total_items: int


@dataclass(frozen=True)
class InspectionRecordPage:
    records: list[InspectionRecordView]
    total_items: int


def period_bounds(
    date_from: date | None, date_to: date | None
) -> tuple[datetime | None, datetime | None]:
    """Convert inclusive Korean dates to a UTC window with an exclusive end."""
    start = (
        datetime.combine(date_from, time.min, tzinfo=SEOUL).astimezone(UTC)
        if date_from is not None
        else None
    )
    end = (
        datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=SEOUL).astimezone(UTC)
        if date_to is not None
        else None
    )
    return start, end


class RecordHistoryService:
    """Query production and inspection history within the caller's filters."""

    def __init__(self, repository: RecordHistoryRepository) -> None:
        self._repository = repository

    def list_process_records(
        self,
        *,
        equipment_id: int | None,
        product_id: int | None,
        date_from: date | None,
        date_to: date | None,
        page: int,
        page_size: int,
    ) -> ProcessRecordPage:
        period_from, period_to = period_bounds(date_from, date_to)
        total_items = self._repository.count_process_records(
            equipment_id=equipment_id,
            product_id=product_id,
            period_from=period_from,
            period_to=period_to,
        )
        records = self._repository.find_process_records(
            equipment_id=equipment_id,
            product_id=product_id,
            period_from=period_from,
            period_to=period_to,
            offset=(page - 1) * page_size,
            limit=page_size,
        )
        return ProcessRecordPage(records=records, total_items=total_items)

    def get_process_record(self, record_id: int) -> ProcessRecordView:
        view = self._repository.find_process_record(record_id)
        if view is None:
            raise RecordNotFoundError
        return view

    def list_inspection_records(
        self,
        *,
        equipment_id: int | None,
        product_id: int | None,
        verdict: str | None,
        date_from: date | None,
        date_to: date | None,
        page: int,
        page_size: int,
    ) -> InspectionRecordPage:
        period_from, period_to = period_bounds(date_from, date_to)
        total_items = self._repository.count_inspection_records(
            equipment_id=equipment_id,
            product_id=product_id,
            verdict=verdict,
            period_from=period_from,
            period_to=period_to,
        )
        records = self._repository.find_inspection_records(
            equipment_id=equipment_id,
            product_id=product_id,
            verdict=verdict,
            period_from=period_from,
            period_to=period_to,
            offset=(page - 1) * page_size,
            limit=page_size,
        )
        return InspectionRecordPage(records=records, total_items=total_items)

    def get_inspection_record(self, record_id: int) -> InspectionRecordView:
        view = self._repository.find_inspection_record(record_id)
        if view is None:
            raise RecordNotFoundError
        return view
