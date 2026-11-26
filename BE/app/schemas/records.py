from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, Field


class Pagination(BaseModel):
    page: int
    page_size: int
    total_items: int
    total_pages: int


class ProcessRecordItem(BaseModel):
    record_id: int
    equipment_id: int
    equipment_code: str
    equipment_name: str
    product_id: int | None
    product_code: str | None
    product_name: str | None
    occurred_at: datetime
    available_at: datetime | None
    cycle_time_seconds: Decimal | None
    is_demo: bool
    version: int


class ProcessRecordListResponse(BaseModel):
    items: list[ProcessRecordItem]
    pagination: Pagination


class ProcessRecordDetail(ProcessRecordItem):
    source_import_id: int
    source_row_number: int
    produced_quantity: Annotated[int, Field(ge=0)] | None = None


class InspectionRecordItem(BaseModel):
    record_id: int
    equipment_id: int
    equipment_code: str
    equipment_name: str
    product_id: int | None
    product_code: str | None
    product_name: str | None
    process_record_id: int | None
    inspected_at: datetime
    available_at: datetime | None
    verdict: Literal["good", "defect"]
    defect_type: str | None
    reason: str | None
    inspected_quantity: Annotated[int, Field(ge=0)] | None = None
    good_quantity: Annotated[int, Field(ge=0)] | None = None
    defect_quantity: Annotated[int, Field(ge=0)] | None = None
    inspector_id: Annotated[int, Field(gt=0)] | None = None
    is_demo: bool
    version: int


class InspectionRecordListResponse(BaseModel):
    items: list[InspectionRecordItem]
    pagination: Pagination
