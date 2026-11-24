from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.orm import Session

from app.models.master import Department, Equipment, ProductionLine
from app.models.process import InspectionRecord, ProcessRecord


@dataclass(frozen=True)
class GenerationTotals:
    production_record_count: int
    inspected_count: int
    good_count: int
    defect_count: int
    includes_demo: bool


class ReportGenerationRepository:
    """Read aggregate-only source data for report generation."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def resolve_equipment_ids(
        self,
        *,
        department_ids: list[int],
        production_line_ids: list[int],
        equipment_ids: list[int],
    ) -> list[int] | None:
        if not department_ids and not production_line_ids and not equipment_ids:
            return None
        conditions: list[ColumnElement[bool]] = []
        if department_ids:
            conditions.append(ProductionLine.department_id.in_(department_ids))
        if production_line_ids:
            conditions.append(Equipment.production_line_id.in_(production_line_ids))
        if equipment_ids:
            conditions.append(Equipment.id.in_(equipment_ids))
        return list(
            self._session.scalars(
                select(Equipment.id)
                .outerjoin(ProductionLine, ProductionLine.id == Equipment.production_line_id)
                .where(Equipment.deleted_at.is_(None), or_(*conditions))
                .order_by(Equipment.id)
            )
        )

    def equipment_labels(self, equipment_ids: list[int] | None) -> list[dict[str, object]]:
        statement = (
            select(
                Equipment.id,
                Equipment.equipment_code,
                Equipment.name,
                ProductionLine.name,
                Department.name,
            )
            .outerjoin(ProductionLine, ProductionLine.id == Equipment.production_line_id)
            .outerjoin(Department, Department.id == ProductionLine.department_id)
            .where(Equipment.deleted_at.is_(None))
            .order_by(Equipment.equipment_code, Equipment.id)
        )
        if equipment_ids is not None:
            statement = statement.where(Equipment.id.in_(equipment_ids))
        return [
            {
                "id": equipment_id,
                "code": code,
                "name": name,
                "production_line": line_name,
                "department": department_name,
            }
            for equipment_id, code, name, line_name, department_name in self._session.execute(
                statement
            )
        ]

    def totals(
        self,
        *,
        equipment_ids: list[int] | None,
        period_from: datetime | None,
        period_to: datetime | None,
        data_cutoff_at: datetime,
    ) -> GenerationTotals:
        inspection_conditions = self._inspection_conditions(
            equipment_ids=equipment_ids,
            period_from=period_from,
            period_to=period_to,
            data_cutoff_at=data_cutoff_at,
        )
        inspection = self._session.execute(
            select(
                func.count().label("inspected"),
                func.count().filter(InspectionRecord.verdict == "good").label("good"),
                func.count().filter(InspectionRecord.verdict == "defect").label("defect"),
                func.coalesce(func.bool_or(InspectionRecord.is_demo), False).label("demo"),
            ).where(*inspection_conditions)
        ).one()
        process_conditions = self._process_conditions(
            equipment_ids=equipment_ids,
            period_from=period_from,
            period_to=period_to,
            data_cutoff_at=data_cutoff_at,
        )
        process = self._session.execute(
            select(
                func.count().label("records"),
                func.coalesce(func.bool_or(ProcessRecord.is_demo), False).label("demo"),
            ).where(*process_conditions)
        ).one()
        return GenerationTotals(
            production_record_count=int(process.records),
            inspected_count=int(inspection.inspected),
            good_count=int(inspection.good),
            defect_count=int(inspection.defect),
            includes_demo=bool(inspection.demo or process.demo),
        )

    def defect_type_counts(
        self,
        *,
        equipment_ids: list[int] | None,
        period_from: datetime | None,
        period_to: datetime | None,
        data_cutoff_at: datetime,
    ) -> list[tuple[str | None, int]]:
        conditions = self._inspection_conditions(
            equipment_ids=equipment_ids,
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
        )
        return [(defect_type, int(count)) for defect_type, count in rows]

    def _inspection_conditions(
        self,
        *,
        equipment_ids: list[int] | None,
        period_from: datetime | None,
        period_to: datetime | None,
        data_cutoff_at: datetime,
    ) -> list[ColumnElement[bool]]:
        conditions: list[ColumnElement[bool]] = [
            InspectionRecord.deleted_at.is_(None),
            InspectionRecord.inspected_at <= data_cutoff_at,
        ]
        if equipment_ids is not None:
            conditions.append(InspectionRecord.equipment_id.in_(equipment_ids))
        if period_from is not None:
            conditions.append(InspectionRecord.inspected_at >= period_from)
        if period_to is not None:
            conditions.append(InspectionRecord.inspected_at < period_to)
        return conditions

    def _process_conditions(
        self,
        *,
        equipment_ids: list[int] | None,
        period_from: datetime | None,
        period_to: datetime | None,
        data_cutoff_at: datetime,
    ) -> list[ColumnElement[bool]]:
        conditions: list[ColumnElement[bool]] = [
            ProcessRecord.deleted_at.is_(None),
            ProcessRecord.occurred_at <= data_cutoff_at,
        ]
        if equipment_ids is not None:
            conditions.append(ProcessRecord.equipment_id.in_(equipment_ids))
        if period_from is not None:
            conditions.append(ProcessRecord.occurred_at >= period_from)
        if period_to is not None:
            conditions.append(ProcessRecord.occurred_at < period_to)
        return conditions
