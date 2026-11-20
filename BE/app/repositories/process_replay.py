from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.master import Equipment, Product
from app.models.process import ProcessRecord, ProcessReplay


@dataclass(frozen=True)
class CurrentProcessRecord:
    record: ProcessRecord
    equipment: Equipment
    product: Product | None


class ProcessReplayRepository:
    """Database access for one-at-a-time process replay advancement."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def lock_replay(self, replay_id: int) -> ProcessReplay | None:
        return self._session.scalar(
            select(ProcessReplay).where(ProcessReplay.id == replay_id).with_for_update()
        )

    def find_next_record(self, source_import_id: int, cursor: int) -> ProcessRecord | None:
        return self._session.scalar(
            select(ProcessRecord)
            .where(
                ProcessRecord.source_import_id == source_import_id,
                ProcessRecord.source_row_number > cursor,
                ProcessRecord.deleted_at.is_(None),
            )
            .order_by(ProcessRecord.source_row_number, ProcessRecord.id)
            .limit(1)
        )

    def find_latest_replay(self) -> ProcessReplay | None:
        return self._session.scalar(
            select(ProcessReplay).order_by(ProcessReplay.id.desc()).limit(1)
        )

    def find_current_records(
        self,
        source_import_id: int,
        *,
        available_at: datetime,
        equipment_id: int | None = None,
    ) -> list[CurrentProcessRecord]:
        rank = func.row_number().over(
            partition_by=ProcessRecord.equipment_id,
            order_by=(ProcessRecord.source_row_number.desc(), ProcessRecord.id.desc()),
        )
        ranked_records = (
            select(ProcessRecord.id.label("record_id"), rank.label("position"))
            .where(
                ProcessRecord.source_import_id == source_import_id,
                ProcessRecord.available_at.is_not(None),
                ProcessRecord.available_at <= available_at,
                ProcessRecord.deleted_at.is_(None),
            )
            .subquery()
        )
        statement = (
            select(ProcessRecord, Equipment, Product)
            .join(ranked_records, ranked_records.c.record_id == ProcessRecord.id)
            .join(Equipment, Equipment.id == ProcessRecord.equipment_id)
            .outerjoin(Product, Product.id == ProcessRecord.product_id)
            .where(ranked_records.c.position == 1, Equipment.deleted_at.is_(None))
            .order_by(Equipment.equipment_code, Equipment.id)
        )
        if equipment_id is not None:
            statement = statement.where(ProcessRecord.equipment_id == equipment_id)

        return [
            CurrentProcessRecord(record=record, equipment=equipment, product=product)
            for record, equipment, product in self._session.execute(statement).all()
        ]
