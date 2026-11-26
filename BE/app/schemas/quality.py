from datetime import date
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, Field


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
    produced_quantity: Annotated[int, Field(ge=0)] | None = None
    target_quantity: Annotated[int, Field(ge=0)] | None = None
    inspected_quantity: Annotated[int, Field(ge=0)] | None = None
    good_quantity: Annotated[int, Field(ge=0)] | None = None
    defect_quantity: Annotated[int, Field(ge=0)] | None = None
    includes_demo: bool


class OperationSummaryResponse(BaseModel):
    equipment_id: int | None
    from_date: date | None
    to_date: date | None
    planned_hours: Decimal
    actual_hours: Decimal
    operation_rate: Decimal | None
    includes_demo: bool
