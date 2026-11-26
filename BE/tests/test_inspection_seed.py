from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock

from app.models.process import InspectionRecord, ProcessRecord
from app.repositories.inspection_seed import InspectionSeedRepository
from app.services.inspection_seed import (
    InspectionSeedService,
    read_defect_type,
    read_verdict,
)
from sqlalchemy.orm import Session

NOW = datetime(2026, 11, 26, 12, 0, tzinfo=UTC)


class FakeInspectionSeedRepository(InspectionSeedRepository):
    def __init__(self, records: list[ProcessRecord], inspected_ids: set[int] | None = None) -> None:
        self.records = records
        self.inspected_ids = inspected_ids or set()
        self.added: list[InspectionRecord] = []

    def list_process_records(self, source_namespace: str) -> list[ProcessRecord]:
        return self.records

    def find_inspected_process_ids(self, process_record_ids: Sequence[int]) -> set[int]:
        return {record_id for record_id in process_record_ids if record_id in self.inspected_ids}

    def add_inspections(self, rows: list[InspectionRecord]) -> None:
        self.added.extend(rows)


def make_record(
    record_id: int,
    *,
    payload: dict[str, object],
    occurred_at: datetime = NOW - timedelta(hours=1),
) -> ProcessRecord:
    return ProcessRecord(
        id=record_id,
        equipment_id=1,
        product_id=2,
        occurred_at=occurred_at,
        source_payload=payload,
    )


def test_read_verdict_accepts_supported_formats() -> None:
    assert read_verdict({"PassOrFail": "True"}) == "good"
    assert read_verdict({"PassOrFail": "Y"}) == "good"
    assert read_verdict({"PassOrFail": "0"}) == "good"
    assert read_verdict({"PassOrFail": "False"}) == "defect"
    assert read_verdict({"PassOrFail": "N"}) == "defect"
    assert read_verdict({"PassOrFail": "1"}) == "defect"
    assert read_verdict({"PassOrFail": ""}) is None
    assert read_verdict({}) is None


def test_read_defect_type_normalizes_empty_and_truncates() -> None:
    assert read_defect_type({"Reason": " 가스 "}) == "가스"
    assert read_defect_type({"Reason": ""}) is None
    assert read_defect_type({"Reason": "None"}) is None
    assert read_defect_type({}) is None
    assert len(read_defect_type({"Reason": "가" * 120}) or "") == 100


def test_seed_creates_inspections_from_payload_verdicts() -> None:
    records = [
        make_record(1, payload={"PassOrFail": "True"}),
        make_record(2, payload={"PassOrFail": "False", "Reason": "가스"}),
        make_record(3, payload={"PassOrFail": "Y"}),
        make_record(4, payload={"PassOrFail": "N", "Reason": ""}),
    ]
    repository = FakeInspectionSeedRepository(records)
    session = MagicMock(spec=Session)
    service = InspectionSeedService(session, repository, clock=lambda: NOW)

    result = service.seed(source_namespace="molding_csv")

    assert result.created == 4
    assert result.skipped_existing == 0
    assert result.skipped_without_verdict == 0
    assert [row.verdict for row in repository.added] == ["good", "defect", "good", "defect"]
    assert [row.defect_type for row in repository.added] == [None, "가스", None, None]
    assert all(row.is_demo for row in repository.added)
    assert [row.process_record_id for row in repository.added] == [1, 2, 3, 4]
    assert all(
        row.inspected_at == (NOW - timedelta(hours=1)) + timedelta(seconds=60)
        for row in repository.added
    )
    session.commit.assert_called_once_with()


def test_seed_skips_existing_and_missing_verdicts() -> None:
    records = [
        make_record(1, payload={"PassOrFail": "True"}),
        make_record(2, payload={"PassOrFail": "False", "Reason": "미성형"}),
        make_record(3, payload={"PassOrFail": ""}),
    ]
    repository = FakeInspectionSeedRepository(records, inspected_ids={1})
    service = InspectionSeedService(MagicMock(spec=Session), repository, clock=lambda: NOW)

    result = service.seed(source_namespace="molding_csv")

    assert result.created == 1
    assert result.skipped_existing == 1
    assert result.skipped_without_verdict == 1
    assert [row.process_record_id for row in repository.added] == [2]


def test_seed_caps_inspected_at_at_now() -> None:
    records = [
        make_record(1, payload={"PassOrFail": "True"}, occurred_at=NOW - timedelta(seconds=10))
    ]
    repository = FakeInspectionSeedRepository(records)
    service = InspectionSeedService(MagicMock(spec=Session), repository, clock=lambda: NOW)

    service.seed(source_namespace="molding_csv")

    assert repository.added[0].inspected_at == NOW
