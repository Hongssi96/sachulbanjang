from pydantic import BaseModel


class PasswordResetResponse(BaseModel):
    user_id: int
    employee_no: str
    temporary_password: str
    must_change_password: bool
    version: int
