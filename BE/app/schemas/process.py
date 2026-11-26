from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, Field


class CurrentProcessItem(BaseModel):
    equipment_id: int
    equipment_code: str
    equipment_name: str
    equipment_status: Literal["unknown"] = "unknown"
    equipment_status_observed_at: AwareDatetime | None = None
    product_id: int | None
    product_code: str | None
    product_name: str | None
    cycle_time_seconds: Decimal | None
    produced_quantity: Annotated[int, Field(ge=0)] | None = None
    target_quantity: Annotated[int, Field(ge=0)] | None = None
    occurred_at: datetime
    available_at: datetime
    is_demo: bool


class CurrentProcessResponse(BaseModel):
    queried_at: datetime
    replay_id: int | None
    replay_state: Literal["ready", "running", "delayed", "completed", "failed"] | None
    data_time: datetime | None
    last_advanced_at: datetime | None
    items: list[CurrentProcessItem]
