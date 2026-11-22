from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel


class CurrentProcessItem(BaseModel):
    equipment_id: int
    equipment_code: str
    equipment_name: str
    equipment_status: Literal["unknown"] = "unknown"
    product_id: int | None
    product_code: str | None
    product_name: str | None
    cycle_time_seconds: Decimal | None
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
