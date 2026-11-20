import argparse
from datetime import time
from unittest.mock import MagicMock

import pytest
from app.commands.seed_accounts import build_parser, parse_local_time, resolve_password
from app.models.master import AppUser
from app.repositories.auth import AuthRepository
from app.security.passwords import verify_password
from app.services.account_seed import AccountSeedError, AccountSeedService, SeedAccountRequest
from sqlalchemy.orm import Session


class RecordingAccountRepository(AuthRepository):
    def __init__(self, existing: AppUser | None = None) -> None:
        self.existing = existing
        self.added: list[AppUser] = []

    def find_user_by_employee_no(self, employee_no: str) -> AppUser | None:
        return self.existing

    def add_user(self, user: AppUser) -> None:
        self.added.append(user)


def make_user(employee_no: str = "E100") -> AppUser:
    return AppUser(
        id=1,
        employee_no=employee_no,
        display_name="기존 사용자",
        password_hash="stored-hash",
        role="worker",
        must_change_password=False,
        shift_start_local=time(9, 0),
        shift_end_local=time(18, 0),
    )


def make_request(
    *,
    employee_no: str = "E100",
    display_name: str = "관리자",
    password: str = "initial-password",
    role: str = "admin",
    shift_start_local: time = time(9, 0),
    shift_end_local: time = time(18, 0),
    must_change_password: bool = True,
) -> SeedAccountRequest:
    return SeedAccountRequest(
        employee_no=employee_no,
        display_name=display_name,
        password=password,
        role=role,
        shift_start_local=shift_start_local,
        shift_end_local=shift_end_local,
        must_change_password=must_change_password,
    )


def build_service(
    existing: AppUser | None = None,
) -> tuple[AccountSeedService, RecordingAccountRepository, MagicMock]:
    session = MagicMock(spec=Session)
    repository = RecordingAccountRepository(existing)
    return AccountSeedService(session, repository), repository, session


def test_create_account_hashes_password_and_requests_change() -> None:
    service, repository, session = build_service()

    user = service.create_account(make_request())

    assert user.employee_no == "E100"
    assert user.role == "admin"
    assert user.must_change_password is True
    assert user.password_hash != "initial-password"
    assert verify_password("initial-password", user.password_hash)
    assert repository.added == [user]
    session.commit.assert_called_once_with()


def test_create_account_rejects_existing_employee_number() -> None:
    service, repository, session = build_service(make_user())

    with pytest.raises(AccountSeedError, match="already exists"):
        service.create_account(make_request())

    assert repository.added == []
    session.commit.assert_not_called()


def test_create_account_rejects_empty_password() -> None:
    service, repository, _ = build_service()

    with pytest.raises(AccountSeedError, match="password"):
        service.create_account(make_request(password=""))

    assert repository.added == []


def test_create_account_rejects_unknown_role() -> None:
    service, repository, _ = build_service()

    with pytest.raises(AccountSeedError, match="role"):
        service.create_account(make_request(role="owner"))

    assert repository.added == []


def test_parser_requires_employee_name_and_role() -> None:
    with pytest.raises(SystemExit):
        build_parser().parse_args([])

    args = build_parser().parse_args(
        ["--employee-no", "E100", "--display-name", "관리자", "--role", "worker"]
    )

    assert args.shift_start == time(9, 0)
    assert args.shift_end == time(18, 0)
    assert args.no_must_change_password is False


def test_parser_rejects_unknown_role() -> None:
    with pytest.raises(SystemExit):
        build_parser().parse_args(
            ["--employee-no", "E100", "--display-name", "관리자", "--role", "owner"]
        )


def test_parse_local_time_rejects_invalid_value() -> None:
    assert parse_local_time("18:30") == time(18, 30)

    with pytest.raises(argparse.ArgumentTypeError):
        parse_local_time("25:00")


def test_password_is_prompted_when_not_passed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.commands.seed_accounts.getpass.getpass",
        lambda prompt: "prompted-password",
    )

    assert resolve_password(None) == "prompted-password"
    assert resolve_password("given-password") == "given-password"
