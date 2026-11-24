from dataclasses import dataclass
from datetime import date

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.orm import Session

from app.models.operation import OperationDay


@dataclass(frozen=True)
class OperationTotals:
    planned_seconds: int
    actual_seconds: int
    includes_demo: bool


class OperationRepository:
    """Read and seed equipment run-time rows per Korean calendar day."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def _conditions(
        self,
        *,
        equipment_id: int | None,
        date_from: date | None,
        date_to: date | None,
    ) -> list[ColumnElement[bool]]:
        conditions: list[ColumnElement[bool]] = []
        if equipment_id is not None:
            conditions.append(OperationDay.equipment_id == equipment_id)
        if date_from is not None:
            conditions.append(OperationDay.day >= date_from)
        if date_to is not None:
            conditions.append(OperationDay.day <= date_to)
        return conditions

    def totals(
        self,
        *,
        equipment_id: int | None,
        date_from: date | None,
        date_to: date | None,
    ) -> OperationTotals:
        conditions = self._conditions(
            equipment_id=equipment_id, date_from=date_from, date_to=date_to
        )
        row = self._session.execute(
            select(
                func.coalesce(func.sum(OperationDay.planned_seconds), 0).label("planned"),
                func.coalesce(func.sum(OperationDay.actual_seconds), 0).label("actual"),
                func.coalesce(func.bool_or(OperationDay.is_demo), False).label("demo"),
            ).where(*conditions)
        ).one()
        return OperationTotals(
            planned_seconds=int(row.planned),
            actual_seconds=int(row.actual),
            includes_demo=bool(row.demo),
        )

    def find_existing_keys(self, *, date_from: date, date_to: date) -> set[tuple[int, date]]:
        rows = self._session.execute(
            select(OperationDay.equipment_id, OperationDay.day).where(
                OperationDay.day >= date_from,
                OperationDay.day <= date_to,
            )
        )
        return {(equipment_id, day) for equipment_id, day in rows}

    def add_days(self, rows: list[OperationDay]) -> None:
        self._session.add_all(rows)
