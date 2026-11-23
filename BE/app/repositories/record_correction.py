from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.master import AppUser, Equipment, Product
from app.models.process import ProcessRecord, RecordChange
from app.repositories.record_history import ProcessRecordView


@dataclass(frozen=True)
class RecordChangeView:
    change: RecordChange
    actor_display_name: str


class RecordCorrectionRepository:
    """Data access for administrator corrections and their audit trail."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def find_process_record_for_update(self, record_id: int) -> ProcessRecordView | None:
        statement = (
            select(ProcessRecord, Equipment, Product)
            .join(Equipment, Equipment.id == ProcessRecord.equipment_id)
            .outerjoin(Product, Product.id == ProcessRecord.product_id)
            .where(ProcessRecord.id == record_id, ProcessRecord.deleted_at.is_(None))
            .with_for_update()
        )
        row = self._session.execute(statement).first()
        if row is None:
            return None
        record, equipment, product = row
        return ProcessRecordView(record=record, equipment=equipment, product=product)

    def find_process_record(self, record_id: int) -> ProcessRecordView | None:
        statement = (
            select(ProcessRecord, Equipment, Product)
            .join(Equipment, Equipment.id == ProcessRecord.equipment_id)
            .outerjoin(Product, Product.id == ProcessRecord.product_id)
            .where(ProcessRecord.id == record_id, ProcessRecord.deleted_at.is_(None))
        )
        row = self._session.execute(statement).first()
        if row is None:
            return None
        record, equipment, product = row
        return ProcessRecordView(record=record, equipment=equipment, product=product)

    def add_change(self, change: RecordChange) -> None:
        self._session.add(change)

    def list_process_changes(self, record_id: int) -> list[RecordChangeView]:
        rows = self._session.execute(
            select(RecordChange, AppUser.display_name)
            .join(AppUser, AppUser.id == RecordChange.actor_id)
            .where(RecordChange.process_record_id == record_id)
            .order_by(RecordChange.occurred_at.desc(), RecordChange.id.desc())
        )
        return [
            RecordChangeView(change=change, actor_display_name=actor_name)
            for change, actor_name in rows
        ]
