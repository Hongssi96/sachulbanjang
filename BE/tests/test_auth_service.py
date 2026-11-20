from datetime import UTC, datetime, time, timedelta
from unittest.mock import MagicMock

import pytest
from app.core.config import Settings
from app.models.auth import AuthSession, RefreshCredential
from app.models.master import AppUser
from app.repositories.auth import AuthRepository
from app.security.passwords import hash_password
from app.security.tokens import decode_access_token, digest_token
from app.services.auth import (
    AccountLockedError,
    AuthService,
    InvalidCredentialsError,
)
from sqlalchemy.orm import Session

NOW = datetime.now(UTC) - timedelta(seconds=5)


def make_settings(*, login_max_failures: int = 5, login_lock_seconds: int = 300) -> Settings:
    return Settings(
        _env_file=None,
        database_url="postgresql+psycopg://user:password@localhost/database",
        jwt_secret="test-secret-that-is-at-least-32-characters",
        login_max_failures=login_max_failures,
        login_lock_seconds=login_lock_seconds,
    )


def make_user(**overrides: object) -> AppUser:
    values: dict[str, object] = {
        "id": 1,
        "employee_no": "E001",
        "display_name": "테스트 사용자",
        "password_hash": hash_password("correct-password"),
        "role": "worker",
        "must_change_password": False,
        "shift_start_local": time(9, 0),
        "shift_end_local": time(18, 0),
        "failed_login_count": 0,
        "locked_until": None,
        "version": 1,
    }
    values.update(overrides)
    return AppUser(**values)


class RecordingAuthRepository(AuthRepository):
    def __init__(self, user: AppUser | None) -> None:
        self.user = user
        self.sessions: list[AuthSession] = []
        self.credentials: list[RefreshCredential] = []

    def find_active_user_for_login(self, employee_no: str) -> AppUser | None:
        return self.user

    def add_session(self, auth_session: AuthSession) -> None:
        auth_session.id = len(self.sessions) + 1
        self.sessions.append(auth_session)

    def add_refresh_credential(self, credential: RefreshCredential) -> None:
        self.credentials.append(credential)


def build_service(
    user: AppUser | None,
    *,
    login_max_failures: int = 5,
    login_lock_seconds: int = 300,
) -> tuple[AuthService, RecordingAuthRepository, MagicMock]:
    session = MagicMock(spec=Session)
    repository = RecordingAuthRepository(user)
    settings = make_settings(
        login_max_failures=login_max_failures, login_lock_seconds=login_lock_seconds
    )
    service = AuthService(session, repository, settings, clock=lambda: NOW)
    return service, repository, session


def test_login_starts_session_and_resets_failed_count() -> None:
    user = make_user(failed_login_count=3)
    service, repository, session = build_service(user)

    result = service.login("E001", "correct-password")

    assert result.user is user
    assert result.session_id == 1
    assert user.failed_login_count == 0
    assert user.locked_until is None
    assert len(repository.sessions) == 1
    assert repository.sessions[0].absolute_expires_at == NOW + timedelta(days=7)
    assert len(repository.credentials) == 1
    assert repository.credentials[0].token_digest == digest_token(result.refresh_token)
    assert repository.credentials[0].token_digest != result.refresh_token
    session.commit.assert_called_once_with()

    claims = decode_access_token(
        result.access_token, secret=make_settings().jwt_secret.get_secret_value()
    )
    assert claims.user_id == user.id
    assert claims.session_id == result.session_id
    assert claims.role == "worker"


def test_wrong_password_increments_failed_count_and_commits() -> None:
    user = make_user()
    service, repository, session = build_service(user)

    with pytest.raises(InvalidCredentialsError):
        service.login("E001", "wrong-password")

    assert user.failed_login_count == 1
    assert user.locked_until is None
    assert repository.sessions == []
    session.commit.assert_called_once_with()


def test_fifth_consecutive_failure_locks_account() -> None:
    user = make_user(failed_login_count=4)
    service, _, session = build_service(user, login_max_failures=5, login_lock_seconds=300)

    with pytest.raises(AccountLockedError) as caught:
        service.login("E001", "wrong-password")

    assert caught.value.locked_until == NOW + timedelta(seconds=300)
    assert user.failed_login_count == 5
    assert user.locked_until == NOW + timedelta(seconds=300)
    session.commit.assert_called_once_with()


def test_locked_account_is_rejected_before_password_check() -> None:
    locked_until = NOW + timedelta(seconds=60)
    user = make_user(failed_login_count=5, locked_until=locked_until)
    service, repository, session = build_service(user)

    with pytest.raises(AccountLockedError) as caught:
        service.login("E001", "correct-password")

    assert caught.value.locked_until == locked_until
    assert repository.sessions == []
    session.commit.assert_not_called()


def test_expired_lock_is_cleared_and_login_succeeds() -> None:
    user = make_user(failed_login_count=5, locked_until=NOW - timedelta(seconds=1))
    service, repository, _ = build_service(user)

    result = service.login("E001", "correct-password")

    assert result.user is user
    assert user.failed_login_count == 0
    assert user.locked_until is None
    assert len(repository.sessions) == 1


def test_expired_lock_restarts_count_on_next_failure() -> None:
    user = make_user(failed_login_count=5, locked_until=NOW - timedelta(seconds=1))
    service, _, _ = build_service(user)

    with pytest.raises(InvalidCredentialsError):
        service.login("E001", "wrong-password")

    assert user.failed_login_count == 1
    assert user.locked_until is None


def test_unknown_employee_number_is_rejected_without_session() -> None:
    service, repository, session = build_service(None)

    with pytest.raises(InvalidCredentialsError):
        service.login("missing", "any-password")

    assert repository.sessions == []
    session.commit.assert_not_called()
