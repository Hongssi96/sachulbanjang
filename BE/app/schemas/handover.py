from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

HandoverTargetKind = Literal["department", "production_line", "equipment"]


class Pagination(BaseModel):
    page: int
    page_size: int
    total_items: int
    total_pages: int


class HandoverTargetInput(BaseModel):
    kind: HandoverTargetKind
    id: int = Field(ge=1)


class HandoverCreateRequest(BaseModel):
    body: str = Field(min_length=1)
    targets: list[HandoverTargetInput] | None = None

    @field_validator("body")
    @classmethod
    def reject_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("본문을 입력해 주세요.")
        return value

    @model_validator(mode="after")
    def reject_duplicate_targets(self) -> HandoverCreateRequest:
        if self.targets is not None:
            keys = [(target.kind, target.id) for target in self.targets]
            if len(keys) != len(set(keys)):
                raise ValueError("같은 담당 대상을 중복 지정할 수 없습니다.")
        return self


class HandoverUpdateRequest(BaseModel):
    version: int = Field(ge=1)
    body: str | None = Field(default=None, min_length=1)
    targets: list[HandoverTargetInput] | None = None

    @field_validator("body")
    @classmethod
    def reject_blank(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("본문을 입력해 주세요.")
        return value

    @model_validator(mode="after")
    def require_change(self) -> HandoverUpdateRequest:
        if not self.model_fields_set - {"version"}:
            raise ValueError("수정할 필드를 하나 이상 지정해야 합니다.")
        if self.targets is not None:
            keys = [(target.kind, target.id) for target in self.targets]
            if len(keys) != len(set(keys)):
                raise ValueError("같은 담당 대상을 중복 지정할 수 없습니다.")
        return self


class HandoverTargetItem(BaseModel):
    kind: HandoverTargetKind
    target_id: int
    code: str | None
    name: str


class HandoverConfirmationItem(BaseModel):
    user_id: int
    display_name: str
    confirmed_at: datetime


class HandoverListItem(BaseModel):
    note_id: int
    author_id: int
    author_display_name: str
    body: str
    version: int
    created_at: datetime
    updated_at: datetime
    targets: list[HandoverTargetItem]
    confirmed_count: int
    my_confirmed_at: datetime | None


class HandoverDetail(HandoverListItem):
    confirmations: list[HandoverConfirmationItem]


class HandoverListResponse(BaseModel):
    items: list[HandoverListItem]
    pagination: Pagination


class HandoverConfirmationResponse(BaseModel):
    note_id: int
    user_id: int
    confirmed_at: datetime
