from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class DefectTypeCount(BaseModel):
    type: str | None
    count: int


class QualitySummaryResponse(BaseModel):
    inspected_count: int
    good_count: int
    defect_count: int
    defect_rate: Decimal | None
    defect_types: list[DefectTypeCount]
    production_record_count: int
    includes_demo: bool


class OperationSummaryResponse(BaseModel):
    equipment_id: int | None
    from_date: date | None
    to_date: date | None
    planned_hours: Decimal
    actual_hours: Decimal
    operation_rate: Decimal | None
    includes_demo: bool
