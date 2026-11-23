from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator, model_validator

PROCESS_EDITABLE_FIELDS = frozenset(
    {"occurred_at", "cycle_time_seconds", "product_id", "equipment_id"}
)


class ProcessRecordUpdateRequest(BaseModel):
    version: int = Field(ge=1)
    change_reason: str = Field(min_length=1, max_length=500)
    occurred_at: datetime | None = None
    cycle_time_seconds: Decimal | None = None
    product_id: int | None = None
    equipment_id: int | None = None

    @field_validator("change_reason")
    @classmethod
    def reject_blank_reason(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("변경 사유를 입력해 주세요.")
        return normalized

    @field_validator("occurred_at")
    @classmethod
    def require_timezone(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.utcoffset() is None:
            raise ValueError("timezone offset is required")
        return value

    @model_validator(mode="after")
    def require_editable_change(self) -> ProcessRecordUpdateRequest:
        provided = self.model_fields_set & PROCESS_EDITABLE_FIELDS
        if not provided:
            raise ValueError("변경할 필드를 하나 이상 지정해야 합니다.")
        if "occurred_at" in self.model_fields_set and self.occurred_at is None:
            raise ValueError("occurred_at은 null일 수 없습니다.")
        if "equipment_id" in self.model_fields_set and self.equipment_id is None:
            raise ValueError("equipment_id는 null일 수 없습니다.")
        return self

    def editable_changes(self) -> dict[str, object]:
        return {
            field: getattr(self, field)
            for field in sorted(self.model_fields_set & PROCESS_EDITABLE_FIELDS)
        }


class ChangeHistoryItem(BaseModel):
    change_id: int
    operation: str
    actor_id: int
    actor_display_name: str
    before_value: dict[str, object] | None
    after_value: dict[str, object] | None
    reason: str
    version: int
    occurred_at: datetime


class ChangeHistoryResponse(BaseModel):
    items: list[ChangeHistoryItem]
