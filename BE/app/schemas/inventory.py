from datetime import datetime
from typing import Literal

from pydantic import AwareDatetime, BaseModel, Field, field_validator, model_validator

StockMovementKind = Literal["initial", "receipt", "issue", "adjustment", "correction"]
CreatableMovementKind = Literal["initial", "receipt", "issue", "adjustment"]


class Pagination(BaseModel):
    page: int
    page_size: int
    total_items: int
    total_pages: int


class StockItem(BaseModel):
    product_id: int
    product_code: str | None
    name: str
    quantity: int
    minimum_stock: int | None
    is_low_stock: bool
    balance_updated_at: AwareDatetime | None


class StockListResponse(BaseModel):
    items: list[StockItem]
    pagination: Pagination


class MovementItem(BaseModel):
    movement_id: int
    product_id: int
    product_code: str | None
    product_name: str
    kind: StockMovementKind
    delta: int
    reason: str | None
    actor_id: int
    actor_display_name: str
    original_movement_id: int | None
    checked_by_id: int | None
    checked_at: datetime | None
    created_at: datetime


class MovementListResponse(BaseModel):
    items: list[MovementItem]
    pagination: Pagination


class MovementResult(BaseModel):
    movement_id: int
    product_id: int
    kind: StockMovementKind
    delta: int
    quantity_after: int
    checked_at: datetime | None


class MovementCreateRequest(BaseModel):
    product_id: int = Field(ge=1)
    kind: CreatableMovementKind
    quantity: int = Field(ge=0)
    reason: str | None = Field(default=None, max_length=500)

    @field_validator("reason")
    @classmethod
    def normalize_reason(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @model_validator(mode="after")
    def validate_quantity(self) -> MovementCreateRequest:
        if self.kind == "adjustment":
            if not self.reason:
                raise ValueError("조정에는 사유가 필요합니다.")
        elif self.quantity <= 0:
            raise ValueError("입고·출고·초기 재고 수량은 1 이상이어야 합니다.")
        return self


class CorrectionRequest(BaseModel):
    delta: int
    reason: str = Field(min_length=1, max_length=500)

    @field_validator("delta")
    @classmethod
    def reject_zero(cls, value: int) -> int:
        if value == 0:
            raise ValueError("정정 수량은 0일 수 없습니다.")
        return value

    @field_validator("reason")
    @classmethod
    def reject_blank_reason(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("정정 사유를 입력해 주세요.")
        return normalized


class MinimumStockRequest(BaseModel):
    minimum_stock: int | None = Field(default=None, ge=0)


class MinimumStockResponse(BaseModel):
    product_id: int
    minimum_stock: int | None
