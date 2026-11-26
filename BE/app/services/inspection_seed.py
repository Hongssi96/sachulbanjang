from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.models.process import InspectionRecord, ProcessRecord
from app.repositories.inspection_seed import InspectionSeedRepository

_INSPECTION_DELAY = timedelta(seconds=60)
_MAX_DEFECT_TYPE_LENGTH = 100
_GOOD_VALUES = frozenset({"true", "y", "0", "good", "pass"})
_DEFECT_VALUES = frozenset({"false", "n", "1", "defect", "fail"})
_EMPTY_REASONS = frozenset({"", "none", "nan", "null"})


@dataclass(frozen=True)
class InspectionSeedResult:
    created: int
    skipped_existing: int
    skipped_without_verdict: int


def read_verdict(payload: Mapping[str, Any]) -> str | None:
    value = str(payload.get("PassOrFail") or "").strip().lower()
    if value in _GOOD_VALUES:
        return "good"
    if value in _DEFECT_VALUES:
        return "defect"
    return None


def read_defect_type(payload: Mapping[str, Any]) -> str | None:
    value = str(payload.get("Reason") or "").strip()
    if value.lower() in _EMPTY_REASONS:
        return None
    return value[:_MAX_DEFECT_TYPE_LENGTH]


class InspectionSeedService:
    """Create demo inspection rows from the verdicts stored in imported CSV payloads."""

    def __init__(
        self,
        session: Session,
        repository: InspectionSeedRepository,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._session = session
        self._repository = repository
        self._clock = clock or (lambda: datetime.now(UTC))

    def seed(self, *, source_namespace: str = "molding_csv") -> InspectionSeedResult:
        if not source_namespace.strip():
            raise ValueError("source_namespace is required")

        records = self._repository.list_process_records(source_namespace)
        existing = self._repository.find_inspected_process_ids([record.id for record in records])
        now = self._clock()
        pending: list[InspectionRecord] = []
        skipped_existing = 0
        skipped_without_verdict = 0

        for record in records:
            if record.id in existing:
                skipped_existing += 1
                continue
            verdict = read_verdict(record.source_payload)
            if verdict is None:
                skipped_without_verdict += 1
                continue
            pending.append(self._build_row(record, verdict, now))

        self._repository.add_inspections(pending)
        self._session.commit()
        return InspectionSeedResult(
            created=len(pending),
            skipped_existing=skipped_existing,
            skipped_without_verdict=skipped_without_verdict,
        )

    def _build_row(self, record: ProcessRecord, verdict: str, now: datetime) -> InspectionRecord:
        inspected_at = min(record.occurred_at + _INSPECTION_DELAY, now)
        return InspectionRecord(
            equipment_id=record.equipment_id,
            product_id=record.product_id,
            process_record_id=record.id,
            inspected_at=inspected_at,
            available_at=None,
            verdict=verdict,
            defect_type=read_defect_type(record.source_payload) if verdict == "defect" else None,
            reason=None,
            is_demo=True,
            version=1,
        )
