from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.orm import Session

from app.models.master import Equipment
from app.models.process import InspectionRecord, ProcessRecord


@dataclass(frozen=True)
class InspectionTotals:
    inspected_count: int
    good_count: int
    defect_count: int
    includes_demo: bool


class QualityRepository:
    """Read-only aggregation over inspection and production records."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def _inspection_conditions(
        self,
        *,
        equipment_id: int | None,
        product_id: int | None,
        period_from: datetime | None,
        period_to: datetime | None,
        data_cutoff_at: datetime | None,
    ) -> list[ColumnElement[bool]]:
        conditions: list[ColumnElement[bool]] = [InspectionRecord.deleted_at.is_(None)]
        if equipment_id is not None:
            conditions.append(InspectionRecord.equipment_id == equipment_id)
        if product_id is not None:
            conditions.append(InspectionRecord.product_id == product_id)
        if period_from is not None:
            conditions.append(InspectionRecord.inspected_at >= period_from)
        if period_to is not None:
            conditions.append(InspectionRecord.inspected_at < period_to)
        if data_cutoff_at is not None:
            conditions.append(InspectionRecord.inspected_at <= data_cutoff_at)
        return conditions

    def inspection_totals(
        self,
        *,
        equipment_id: int | None,
        product_id: int | None,
        period_from: datetime | None,
        period_to: datetime | None,
        data_cutoff_at: datetime | None = None,
    ) -> InspectionTotals:
        conditions = self._inspection_conditions(
            equipment_id=equipment_id,
            product_id=product_id,
            period_from=period_from,
            period_to=period_to,
            data_cutoff_at=data_cutoff_at,
        )
        row = self._session.execute(
            select(
                func.count().label("inspected"),
                func.count().filter(InspectionRecord.verdict == "good").label("good"),
                func.count().filter(InspectionRecord.verdict == "defect").label("defect"),
                func.coalesce(func.bool_or(InspectionRecord.is_demo), False).label("demo"),
            ).where(*conditions)
        ).one()
        return InspectionTotals(
            inspected_count=int(row.inspected),
            good_count=int(row.good),
            defect_count=int(row.defect),
            includes_demo=bool(row.demo),
        )

    def defect_type_counts(
        self,
        *,
        equipment_id: int | None,
        product_id: int | None,
        period_from: datetime | None,
        period_to: datetime | None,
        data_cutoff_at: datetime | None = None,
    ) -> list[tuple[str | None, int]]:
        conditions = self._inspection_conditions(
            equipment_id=equipment_id,
            product_id=product_id,
            period_from=period_from,
            period_to=period_to,
            data_cutoff_at=data_cutoff_at,
        )
        conditions.append(InspectionRecord.verdict == "defect")
        rows = self._session.execute(
            select(InspectionRecord.defect_type, func.count())
            .where(*conditions)
            .group_by(InspectionRecord.defect_type)
            .order_by(func.count().desc(), InspectionRecord.defect_type.asc().nulls_last())
        ).all()
        return [(defect_type, int(count)) for defect_type, count in rows]

    def production_record_count(
        self,
        *,
        equipment_id: int | None,
        product_id: int | None,
        period_from: datetime | None,
        period_to: datetime | None,
        data_cutoff_at: datetime | None = None,
    ) -> int:
        conditions: list[ColumnElement[bool]] = [ProcessRecord.deleted_at.is_(None)]
        if equipment_id is not None:
            conditions.append(ProcessRecord.equipment_id == equipment_id)
        if product_id is not None:
            conditions.append(ProcessRecord.product_id == product_id)
        if period_from is not None:
            conditions.append(ProcessRecord.occurred_at >= period_from)
        if period_to is not None:
            conditions.append(ProcessRecord.occurred_at < period_to)
        if data_cutoff_at is not None:
            conditions.append(ProcessRecord.occurred_at <= data_cutoff_at)
        return (
            self._session.scalar(select(func.count()).select_from(ProcessRecord).where(*conditions))
            or 0
        )

    def active_equipment_count(self, *, equipment_id: int | None) -> int:
        conditions: list[ColumnElement[bool]] = [Equipment.deleted_at.is_(None)]
        if equipment_id is not None:
            conditions.append(Equipment.id == equipment_id)
        return (
            self._session.scalar(select(func.count()).select_from(Equipment).where(*conditions))
            or 0
        )
