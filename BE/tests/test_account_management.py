from datetime import UTC, datetime, time
from unittest.mock import MagicMock

import pytest
from app.models.master import AppUser
from app.repositories.auth import AuthRepository
from app.security.passwords import verify_password
from app.services.account_management import (
    AccountAlreadyActiveError,
    AccountAlreadyInactiveError,
    AccountManagementService,
    CreateUserCommand,
    EmployeeNumberAlreadyExistsError,
    LastAdminRequiredError,
    SelfDeactivationNotAllowedError,
    SelfRoleChangeNotAllowedError,
    UpdateUserCommand,
    UserVersionConflictError,
)
from app.services.password_reset import UserNotFoundError
from sqlalchemy.exc import IntegrityError

NOW = datetime.now(UTC)


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


def make_target(**overrides: object) -> AppUser:
    values: dict[str, object] = {
        "id": 7,
        "employee_no": "E007",
        "display_name": "고용자",
        "role": "worker",
        "must_change_password": False,
        "shift_start_local": time(9, 0),
        "shift_end_local": time(18, 0),
        "version": 2,
    }
    values.update(overrides)
    return AppUser(**values)


def test_update_user_applies_changes_and_increments_version() -> None:
    actor = make_target(id=1, role="admin")
    target = make_target()
    session = MagicMock()
    repository = MagicMock(spec=AuthRepository)
    repository.find_any_user_for_update.return_value = target

    result = AccountManagementService(session, repository).update_user(
        actor,
        7,
        UpdateUserCommand(
            version=2,
            display_name="새 이름",
            role="admin",
            shift_start_local=time(8, 30),
        ),
    )

    assert result is target
    assert target.display_name == "새 이름"
    assert target.role == "admin"
    assert target.shift_start_local == time(8, 30)
    assert target.shift_end_local == time(18, 0)
    assert target.version == 3
    session.commit.assert_called_once_with()


def test_update_user_rejects_outdated_version() -> None:
    session = MagicMock()
    repository = MagicMock(spec=AuthRepository)
    repository.find_any_user_for_update.return_value = make_target(version=5)

    with pytest.raises(UserVersionConflictError) as caught:
        AccountManagementService(session, repository).update_user(
            make_target(id=1, role="admin"), 7, UpdateUserCommand(version=4, display_name="이름")
        )

    assert caught.value.current_version == 5
    session.commit.assert_not_called()


def test_update_user_blocks_self_role_change_but_allows_other_fields() -> None:
    actor = make_target(id=7, role="admin")
    session = MagicMock()
    repository = MagicMock(spec=AuthRepository)
    repository.find_any_user_for_update.return_value = actor

    with pytest.raises(SelfRoleChangeNotAllowedError):
        AccountManagementService(session, repository).update_user(
            actor, 7, UpdateUserCommand(version=2, role="worker")
        )
    session.commit.assert_not_called()

    AccountManagementService(session, repository).update_user(
        actor, 7, UpdateUserCommand(version=2, display_name="새 이름")
    )
    assert actor.display_name == "새 이름"


def test_update_user_keeps_the_last_active_administrator() -> None:
    actor = make_target(id=1, role="admin")
    target = make_target(role="admin")
    session = MagicMock()
    repository = MagicMock(spec=AuthRepository)
    repository.find_any_user_for_update.return_value = target
    repository.count_other_active_admins.return_value = 0

    with pytest.raises(LastAdminRequiredError):
        AccountManagementService(session, repository).update_user(
            actor, 7, UpdateUserCommand(version=2, role="worker")
        )
    session.commit.assert_not_called()

    repository.count_other_active_admins.return_value = 1
    AccountManagementService(session, repository).update_user(
        actor, 7, UpdateUserCommand(version=2, role="worker")
    )
    assert target.role == "worker"


def test_deactivate_user_soft_deletes_and_revokes_sessions() -> None:
    actor = make_target(id=1, role="admin")
    target = make_target()
    session = MagicMock()
    repository = MagicMock(spec=AuthRepository)
    repository.find_any_user_for_update.return_value = target
    repository.find_sessions_for_update.return_value = []
    repository.find_credentials_for_update.return_value = []

    result = AccountManagementService(session, repository, clock=lambda: NOW).deactivate_user(
        actor, 7, 2
    )

    assert result is target
    assert target.deleted_at == NOW
    assert target.version == 3
    repository.find_sessions_for_update.assert_called_once_with(7)
    session.commit.assert_called_once_with()


def test_deactivate_user_protects_self_and_last_admin() -> None:
    session = MagicMock()
    repository = MagicMock(spec=AuthRepository)
    admin = make_target(id=7, role="admin")
    repository.find_any_user_for_update.return_value = admin

    with pytest.raises(SelfDeactivationNotAllowedError):
        AccountManagementService(session, repository).deactivate_user(admin, 7, 2)

    other = make_target(id=1, role="admin")
    repository.count_other_active_admins.return_value = 0
    with pytest.raises(LastAdminRequiredError):
        AccountManagementService(session, repository).deactivate_user(other, 7, 2)

    repository.count_other_active_admins.return_value = 1
    AccountManagementService(session, repository).deactivate_user(other, 7, 2)
    assert admin.deleted_at is not None


def test_deactivate_user_rejects_inactive_account_and_stale_version() -> None:
    session = MagicMock()
    repository = MagicMock(spec=AuthRepository)
    actor = make_target(id=1, role="admin")

    repository.find_any_user_for_update.return_value = make_target(deleted_at=NOW)
    with pytest.raises(AccountAlreadyInactiveError):
        AccountManagementService(session, repository).deactivate_user(actor, 7, 2)

    repository.find_any_user_for_update.return_value = make_target(version=9)
    with pytest.raises(UserVersionConflictError):
        AccountManagementService(session, repository).deactivate_user(actor, 7, 2)

    session.commit.assert_not_called()


def test_reactivate_user_restores_account() -> None:
    session = MagicMock()
    repository = MagicMock(spec=AuthRepository)
    repository.find_any_user_for_update.return_value = make_target(deleted_at=NOW)

    result = AccountManagementService(session, repository).reactivate_user(7, 2)

    assert result.deleted_at is None
    assert result.version == 3
    session.commit.assert_called_once_with()


def test_reactivate_user_rejects_active_account_and_unknown_user() -> None:
    session = MagicMock()
    repository = MagicMock(spec=AuthRepository)
    repository.find_any_user_for_update.return_value = make_target()

    with pytest.raises(AccountAlreadyActiveError):
        AccountManagementService(session, repository).reactivate_user(7, 2)

    repository.find_any_user_for_update.return_value = None
    with pytest.raises(UserNotFoundError):
        AccountManagementService(session, repository).reactivate_user(7, 2)

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
