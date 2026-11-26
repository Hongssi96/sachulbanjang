from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.process import InspectionRecord, ProcessRecord


class InspectionSeedRepository:
    """Data access for creating demo inspections from imported process records."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def list_process_records(self, source_namespace: str) -> list[ProcessRecord]:
        return list(
            self._session.scalars(
                select(ProcessRecord)
                .where(
                    ProcessRecord.source_namespace == source_namespace,
                    ProcessRecord.deleted_at.is_(None),
                )
                .order_by(ProcessRecord.source_row_number.asc(), ProcessRecord.id.asc())
            )
        )

    def find_inspected_process_ids(self, process_record_ids: Sequence[int]) -> set[int]:
        if not process_record_ids:
            return set()
        rows = self._session.scalars(
            select(InspectionRecord.process_record_id).where(
                InspectionRecord.process_record_id.in_(process_record_ids)
            )
        )
        return {record_id for record_id in rows if record_id is not None}

    def add_inspections(self, rows: list[InspectionRecord]) -> None:
        self._session.add_all(rows)
