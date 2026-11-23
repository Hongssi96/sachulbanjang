from __future__ import annotations

from dataclasses import dataclass
from datetime import time

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.master import AppUser
from app.repositories.auth import AuthRepository
from app.security.passwords import hash_password
from app.services.password_reset import generate_temporary_password


class EmployeeNumberAlreadyExistsError(Exception):
    """Raised when an employee number is already reserved, including by a deleted account."""


@dataclass(frozen=True)
class CreateUserCommand:
    employee_no: str
    display_name: str
    role: str
    shift_start_local: time
    shift_end_local: time


@dataclass(frozen=True)
class CreateUserResult:
    user: AppUser
    temporary_password: str


class AccountManagementService:
    """Create administrator-managed accounts with one-time temporary credentials."""

    def __init__(self, session: Session, repository: AuthRepository) -> None:
        self._session = session
        self._repository = repository

    def create_user(self, command: CreateUserCommand) -> CreateUserResult:
        if self._repository.find_user_by_employee_no(command.employee_no) is not None:
            raise EmployeeNumberAlreadyExistsError

        temporary_password = generate_temporary_password()
        user = AppUser(
            employee_no=command.employee_no,
            display_name=command.display_name,
            password_hash=hash_password(temporary_password),
            role=command.role,
            must_change_password=True,
            shift_start_local=command.shift_start_local,
            shift_end_local=command.shift_end_local,
        )
        try:
            self._repository.add_user(user)
            self._session.commit()
        except IntegrityError:
            self._session.rollback()
            raise EmployeeNumberAlreadyExistsError from None
        return CreateUserResult(user=user, temporary_password=temporary_password)
