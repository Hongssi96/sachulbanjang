from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class LoginRequest(BaseModel):
    employee_no: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=1024)


class AuthenticatedUser(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_no: str
    display_name: str
    role: Literal["admin", "worker"]
    must_change_password: bool
