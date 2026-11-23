from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class LoginRequest(BaseModel):
    employee_no: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=1024)


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=1024)
    new_password: str = Field(min_length=1, max_length=1024)


class AuthenticatedUser(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_no: str
    display_name: str
    role: Literal["admin", "worker"]
    must_change_password: bool


class WorkSessionResponse(BaseModel):
    ends_at: datetime
    warning_starts_at: datetime
    server_time: datetime
    version: int


class WorkSessionExtensionRequest(BaseModel):
    kind: Literal["automatic", "manual"]
    expected_ends_at: datetime
    ends_at: datetime | None = None

    @field_validator("expected_ends_at", "ends_at")
    @classmethod
    def require_timezone(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.utcoffset() is None:
            raise ValueError("timezone offset is required")
        return value
