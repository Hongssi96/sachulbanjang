from datetime import time
from unittest.mock import MagicMock

import pytest
from app.models.master import AppUser
from app.repositories.auth import AuthRepository
from app.security.passwords import verify_password
from app.services.account_management import (
    AccountManagementService,
    CreateUserCommand,
    EmployeeNumberAlreadyExistsError,
)
from app.services.password_reset import UserNotFoundError
from sqlalchemy.exc import IntegrityError


def command(employee_no: str = "E200") -> CreateUserCommand:
    return CreateUserCommand(
        employee_no=employee_no,
        display_name="신규 고용자",
        role="worker",
        shift_start_local=time(9, 0),
        shift_end_local=time(18, 0),
    )


def test_get_user_returns_soft_deleted_account() -> None:
    session = MagicMock()
    repository = MagicMock(spec=AuthRepository)
    deleted = AppUser(id=7)
    repository.find_any_user_by_id.return_value = deleted

    result = AccountManagementService(session, repository).get_user(7)

    repository.find_any_user_by_id.assert_called_once_with(7)
    assert result is deleted


def test_get_user_rejects_unknown_account() -> None:
    session = MagicMock()
    repository = MagicMock(spec=AuthRepository)
    repository.find_any_user_by_id.return_value = None

    with pytest.raises(UserNotFoundError):
        AccountManagementService(session, repository).get_user(7)


def test_create_user_hashes_temporary_password_and_requires_change() -> None:
    session = MagicMock()
    repository = MagicMock(spec=AuthRepository)
    repository.find_user_by_employee_no.return_value = None

    result = AccountManagementService(session, repository).create_user(command())

    repository.add_user.assert_called_once_with(result.user)
    session.commit.assert_called_once_with()
    assert result.user.employee_no == "E200"
    assert result.user.role == "worker"
    assert result.user.must_change_password is True
    assert verify_password(result.temporary_password, result.user.password_hash)
    assert len(result.temporary_password) == 16


def test_create_user_reserves_soft_deleted_employee_number() -> None:
    session = MagicMock()
    repository = MagicMock(spec=AuthRepository)
    repository.find_user_by_employee_no.return_value = AppUser()

    with pytest.raises(EmployeeNumberAlreadyExistsError):
        AccountManagementService(session, repository).create_user(command())

    repository.add_user.assert_not_called()
    session.commit.assert_not_called()


def test_list_users_trims_query_and_paginates() -> None:
    session = MagicMock()
    repository = MagicMock(spec=AuthRepository)
    repository.count_users.return_value = 12
    repository.find_users.return_value = [AppUser()]

    result = AccountManagementService(session, repository).list_users(
        query="  홍길동  ",
        role="worker",
        include_inactive=False,
        page=2,
        page_size=10,
    )

    repository.count_users.assert_called_once_with(
        query="홍길동", role="worker", include_inactive=False
    )
    repository.find_users.assert_called_once_with(
        query="홍길동",
        role="worker",
        include_inactive=False,
        offset=10,
        limit=10,
    )
    assert result.total_items == 12
    assert len(result.users) == 1


def test_list_users_treats_blank_query_as_no_filter() -> None:
    session = MagicMock()
    repository = MagicMock(spec=AuthRepository)
    repository.count_users.return_value = 0
    repository.find_users.return_value = []

    AccountManagementService(session, repository).list_users(
        query="   ",
        role=None,
        include_inactive=True,
        page=1,
        page_size=10,
    )

    repository.count_users.assert_called_once_with(query=None, role=None, include_inactive=True)


def test_create_user_translates_unique_constraint_race_and_rolls_back() -> None:
    session = MagicMock()
    repository = MagicMock(spec=AuthRepository)
    repository.find_user_by_employee_no.return_value = None
    repository.add_user.side_effect = IntegrityError("statement", {}, Exception("duplicate"))

    with pytest.raises(EmployeeNumberAlreadyExistsError):
        AccountManagementService(session, repository).create_user(command())

    session.rollback.assert_called_once_with()
    session.commit.assert_not_called()
