from __future__ import annotations

from dataclasses import dataclass
from datetime import time

from sqlalchemy.orm import Session

from app.models.master import AppUser
from app.repositories.auth import AuthRepository
from app.security.passwords import hash_password

ALLOWED_ROLES = ("admin", "worker")


class AccountSeedError(ValueError):
    """Raised when an initial account cannot be created."""


@dataclass(frozen=True)
class SeedAccountRequest:
    employee_no: str
    display_name: str
    password: str
    role: str
    shift_start_local: time
    shift_end_local: time
    must_change_password: bool = True


class AccountSeedService:
    """Create the pre-provisioned MVP accounts without overwriting existing ones."""

    def __init__(self, session: Session, repository: AuthRepository) -> None:
        self._session = session
        self._repository = repository

    def create_account(self, request: SeedAccountRequest) -> AppUser:
        if request.role not in ALLOWED_ROLES:
            raise AccountSeedError(f"role must be one of {', '.join(ALLOWED_ROLES)}")
        if not request.password:
            raise AccountSeedError("password must not be empty")
        if self._repository.find_user_by_employee_no(request.employee_no) is not None:
            raise AccountSeedError(f"employee number already exists: {request.employee_no}")

        user = AppUser(
            employee_no=request.employee_no,
            display_name=request.display_name,
            password_hash=hash_password(request.password),
            role=request.role,
            must_change_password=request.must_change_password,
            shift_start_local=request.shift_start_local,
            shift_end_local=request.shift_end_local,
        )
        self._repository.add_user(user)
        self._session.commit()
        return user
