from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.orm import Session

from app.models.master import Equipment, Product
from app.models.process import InspectionRecord, ProcessRecord


@dataclass(frozen=True)
class ProcessRecordView:
    record: ProcessRecord
    equipment: Equipment
    product: Product | None


@dataclass(frozen=True)
class InspectionRecordView:
    record: InspectionRecord
    equipment: Equipment
    product: Product | None


class RecordHistoryRepository:
    """Read access for the production and inspection history screens."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def _process_conditions(
        self,
        *,
        equipment_id: int | None,
        product_id: int | None,
        period_from: datetime | None,
        period_to: datetime | None,
    ) -> list[ColumnElement[bool]]:
        conditions: list[ColumnElement[bool]] = [ProcessRecord.deleted_at.is_(None)]
        if equipment_id is not None:
            conditions.append(ProcessRecord.equipment_id == equipment_id)
        if product_id is not None:
            conditions.append(ProcessRecord.product_id == product_id)
        if period_from is not None:
            conditions.append(ProcessRecord.occurred_at >= period_from)
        if period_to is not None:
            conditions.append(ProcessRecord.occurred_at < period_to)
        return conditions

    def count_process_records(
        self,
        *,
        equipment_id: int | None,
        product_id: int | None,
        period_from: datetime | None,
        period_to: datetime | None,
    ) -> int:
        conditions = self._process_conditions(
            equipment_id=equipment_id,
            product_id=product_id,
            period_from=period_from,
            period_to=period_to,
        )
        return (
            self._session.scalar(select(func.count()).select_from(ProcessRecord).where(*conditions))
            or 0
        )

    def find_process_records(
        self,
        *,
        equipment_id: int | None,
        product_id: int | None,
        period_from: datetime | None,
        period_to: datetime | None,
        offset: int,
        limit: int,
    ) -> list[ProcessRecordView]:
        conditions = self._process_conditions(
            equipment_id=equipment_id,
            product_id=product_id,
            period_from=period_from,
            period_to=period_to,
        )
        statement = (
            select(ProcessRecord, Equipment, Product)
            .join(Equipment, Equipment.id == ProcessRecord.equipment_id)
            .outerjoin(Product, Product.id == ProcessRecord.product_id)
            .where(*conditions)
            .order_by(ProcessRecord.occurred_at.desc(), ProcessRecord.id.desc())
            .offset(offset)
            .limit(limit)
        )
        return [
            ProcessRecordView(record=record, equipment=equipment, product=product)
            for record, equipment, product in self._session.execute(statement).all()
        ]

    def _inspection_conditions(
        self,
        *,
        equipment_id: int | None,
        product_id: int | None,
        verdict: str | None,
        period_from: datetime | None,
        period_to: datetime | None,
    ) -> list[ColumnElement[bool]]:
        conditions: list[ColumnElement[bool]] = [InspectionRecord.deleted_at.is_(None)]
        if equipment_id is not None:
            conditions.append(InspectionRecord.equipment_id == equipment_id)
        if product_id is not None:
            conditions.append(InspectionRecord.product_id == product_id)
        if verdict is not None:
            conditions.append(InspectionRecord.verdict == verdict)
        if period_from is not None:
            conditions.append(InspectionRecord.inspected_at >= period_from)
        if period_to is not None:
            conditions.append(InspectionRecord.inspected_at < period_to)
        return conditions

    def count_inspection_records(
        self,
        *,
        equipment_id: int | None,
        product_id: int | None,
        verdict: str | None,
        period_from: datetime | None,
        period_to: datetime | None,
    ) -> int:
        conditions = self._inspection_conditions(
            equipment_id=equipment_id,
            product_id=product_id,
            verdict=verdict,
            period_from=period_from,
            period_to=period_to,
        )
        return (
            self._session.scalar(
                select(func.count()).select_from(InspectionRecord).where(*conditions)
            )
            or 0
        )

    def find_inspection_records(
        self,
        *,
        equipment_id: int | None,
        product_id: int | None,
        verdict: str | None,
        period_from: datetime | None,
        period_to: datetime | None,
        offset: int,
        limit: int,
    ) -> list[InspectionRecordView]:
        conditions = self._inspection_conditions(
            equipment_id=equipment_id,
            product_id=product_id,
            verdict=verdict,
            period_from=period_from,
            period_to=period_to,
        )
        statement = (
            select(InspectionRecord, Equipment, Product)
            .join(Equipment, Equipment.id == InspectionRecord.equipment_id)
            .outerjoin(Product, Product.id == InspectionRecord.product_id)
            .where(*conditions)
            .order_by(InspectionRecord.inspected_at.desc(), InspectionRecord.id.desc())
            .offset(offset)
            .limit(limit)
        )
        return [
            InspectionRecordView(record=record, equipment=equipment, product=product)
            for record, equipment, product in self._session.execute(statement).all()
        ]

    def find_inspection_record(self, record_id: int) -> InspectionRecordView | None:
        statement = (
            select(InspectionRecord, Equipment, Product)
            .join(Equipment, Equipment.id == InspectionRecord.equipment_id)
            .outerjoin(Product, Product.id == InspectionRecord.product_id)
            .where(InspectionRecord.id == record_id, InspectionRecord.deleted_at.is_(None))
        )
        row = self._session.execute(statement).first()
        if row is None:
            return None
        record, equipment, product = row
        return InspectionRecordView(record=record, equipment=equipment, product=product)

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
