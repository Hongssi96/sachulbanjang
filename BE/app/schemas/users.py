from datetime import datetime, time
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class UserCreateRequest(BaseModel):
    employee_no: str = Field(min_length=1, max_length=50)
    display_name: str = Field(min_length=1, max_length=100)
    role: Literal["admin", "worker"]
    shift_start_local: time
    shift_end_local: time

    @field_validator("employee_no", "display_name")
    @classmethod
    def reject_blank_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("공백만 입력할 수 없습니다.")
        return normalized


class UserCreateResponse(BaseModel):
    user_id: int
    employee_no: str
    display_name: str
    role: Literal["admin", "worker"]
    shift_start_local: time
    shift_end_local: time
    temporary_password: str
    must_change_password: bool
    version: int


class Pagination(BaseModel):
    page: int
    page_size: int
    total_items: int
    total_pages: int


class UserListItem(BaseModel):
    user_id: int
    employee_no: str
    display_name: str
    role: Literal["admin", "worker"]
    is_active: bool
    shift_start_local: time
    shift_end_local: time
    version: int


class UserListResponse(BaseModel):
    items: list[UserListItem]
    pagination: Pagination


class UserDetail(BaseModel):
    user_id: int
    employee_no: str
    display_name: str
    role: Literal["admin", "worker"]
    is_active: bool
    shift_start_local: time
    shift_end_local: time
    must_change_password: bool
    version: int
    created_at: datetime
    updated_at: datetime
    deactivated_at: datetime | None


class UserUpdateRequest(BaseModel):
    version: int = Field(ge=1)
    display_name: str | None = Field(default=None, min_length=1, max_length=100)
    role: Literal["admin", "worker"] | None = None
    shift_start_local: time | None = None
    shift_end_local: time | None = None

    @field_validator("display_name")
    @classmethod
    def reject_blank_display_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("공백만 입력할 수 없습니다.")
        return normalized

    @model_validator(mode="after")
    def require_at_least_one_change(self) -> UserUpdateRequest:
        if (
            self.display_name is None
            and self.role is None
            and self.shift_start_local is None
            and self.shift_end_local is None
        ):
            raise ValueError("변경할 필드를 하나 이상 지정해야 합니다.")
        return self


class AccountStatusChangeRequest(BaseModel):
    version: int = Field(ge=1)


class AccountAuditEventItem(BaseModel):
    event_id: int
    action: str
    actor_id: int
    actor_display_name: str
    target_user_id: int
    detail: dict[str, object] | None
    created_at: datetime


class AccountAuditEventListResponse(BaseModel):
    items: list[AccountAuditEventItem]
    pagination: Pagination


class PasswordResetResponse(BaseModel):
    user_id: int
    employee_no: str
    temporary_password: str
    must_change_password: bool
    version: int
