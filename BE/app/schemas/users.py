from datetime import time
from typing import Literal

from pydantic import BaseModel, Field, field_validator


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


class PasswordResetResponse(BaseModel):
    user_id: int
    employee_no: str
    temporary_password: str
    must_change_password: bool
    version: int
