from datetime import UTC, datetime, time, timedelta
from unittest.mock import MagicMock
from zoneinfo import ZoneInfo

import pytest
from app.core.config import Settings
from app.models.auth import AuthSession, RefreshCredential, WorkExtension
from app.models.master import AppUser
from app.repositories.auth import AuthRepository
from app.security.passwords import hash_password, verify_password
from app.security.tokens import (
    create_refresh_token,
    decode_access_token,
    digest_token,
)
from app.services.auth import (
    AccountLockedError,
    AuthService,
    CurrentPasswordMismatchError,
    InvalidCredentialsError,
    InvalidRefreshTokenError,
    PasswordUnchangedError,
    RefreshInProgressError,
    SessionRevokedError,
    TemporaryPasswordExpiredError,
    WorkSessionConflictError,
    WorkSessionExtensionNotAllowedError,
)
from sqlalchemy.orm import Session

NOW = datetime.now(UTC) - timedelta(seconds=5)


def make_settings(
    *,
    login_max_failures: int = 5,
    login_lock_seconds: int = 300,
    refresh_reuse_grace_seconds: int = 10,
) -> Settings:
    return Settings(
        _env_file=None,
        database_url="postgresql+psycopg://user:password@localhost/database",
        jwt_secret="test-secret-that-is-at-least-32-characters",
        login_max_failures=login_max_failures,
        login_lock_seconds=login_lock_seconds,
        refresh_reuse_grace_seconds=refresh_reuse_grace_seconds,
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


class FakeClock:
    def __init__(self, now: datetime) -> None:
        self.now = now

    def __call__(self) -> datetime:
        return self.now

    def advance(self, seconds: int) -> None:
        self.now += timedelta(seconds=seconds)


class RecordingAuthRepository(AuthRepository):
    def __init__(self, user: AppUser | None) -> None:
        self.user = user
        self.sessions: list[AuthSession] = []
        self.credentials: list[RefreshCredential] = []
        self.extensions: list[WorkExtension] = []

    def find_active_user_for_login(self, employee_no: str) -> AppUser | None:
        return self.user

    def find_active_user_by_id(self, user_id: int) -> AppUser | None:
        if self.user is not None and self.user.id == user_id:
            return self.user
        return None

    def add_session(self, auth_session: AuthSession) -> None:
        auth_session.id = len(self.sessions) + 1
        self.sessions.append(auth_session)

    def find_session_for_update(self, session_id: int) -> AuthSession | None:
        return next((item for item in self.sessions if item.id == session_id), None)

    def find_session(self, session_id: int) -> AuthSession | None:
        return next((item for item in self.sessions if item.id == session_id), None)

    def add_refresh_credential(self, credential: RefreshCredential) -> None:
        self.credentials.append(credential)

    def add_work_extension(self, extension: WorkExtension) -> None:
        self.extensions.append(extension)

    def find_credential_for_update(self, token_digest: str) -> RefreshCredential | None:
        return next((item for item in self.credentials if item.token_digest == token_digest), None)

    def find_credential(self, session_id: int, generation: int) -> RefreshCredential | None:
        return next(
            (
                item
                for item in self.credentials
                if item.session_id == session_id and item.generation == generation
            ),
            None,
        )


def build_service(
    user: AppUser | None,
    *,
    login_max_failures: int = 5,
    login_lock_seconds: int = 300,
    refresh_reuse_grace_seconds: int = 10,
) -> tuple[AuthService, RecordingAuthRepository, MagicMock, FakeClock]:
    session = MagicMock(spec=Session)
    repository = RecordingAuthRepository(user)
    settings = make_settings(
        login_max_failures=login_max_failures,
        login_lock_seconds=login_lock_seconds,
        refresh_reuse_grace_seconds=refresh_reuse_grace_seconds,
    )
    clock = FakeClock(NOW)
    service = AuthService(session, repository, settings, clock=clock)
    return service, repository, session, clock


def test_login_starts_session_and_resets_failed_count() -> None:
    user = make_user(failed_login_count=3)
    service, repository, session, _ = build_service(user)

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


def test_wrong_password_increments_failed_count_and_commits() -> None:
    user = make_user()
    service, repository, session, _ = build_service(user)

    with pytest.raises(InvalidCredentialsError):
        service.login("E001", "wrong-password")

    assert user.failed_login_count == 1
    assert user.locked_until is None
    assert repository.sessions == []
    session.commit.assert_called_once_with()


def test_fifth_consecutive_failure_locks_account() -> None:
    user = make_user(failed_login_count=4)
    service, _, session, _ = build_service(user, login_max_failures=5, login_lock_seconds=300)

    with pytest.raises(AccountLockedError) as caught:
        service.login("E001", "wrong-password")

    assert caught.value.locked_until == NOW + timedelta(seconds=300)
    assert user.failed_login_count == 5
    assert user.locked_until == NOW + timedelta(seconds=300)
    session.commit.assert_called_once_with()


def test_locked_account_is_rejected_before_password_check() -> None:
    locked_until = NOW + timedelta(seconds=60)
    user = make_user(failed_login_count=5, locked_until=locked_until)
    service, repository, session, _ = build_service(user)

    with pytest.raises(AccountLockedError) as caught:
        service.login("E001", "correct-password")

    assert caught.value.locked_until == locked_until
    assert repository.sessions == []
    session.commit.assert_not_called()


def test_expired_lock_is_cleared_and_login_succeeds() -> None:
    user = make_user(failed_login_count=5, locked_until=NOW - timedelta(seconds=1))
    service, repository, _, _ = build_service(user)

    result = service.login("E001", "correct-password")

    assert result.user is user
    assert user.failed_login_count == 0
    assert user.locked_until is None
    assert len(repository.sessions) == 1


def test_expired_lock_restarts_count_on_next_failure() -> None:
    user = make_user(failed_login_count=5, locked_until=NOW - timedelta(seconds=1))
    service, _, _, _ = build_service(user)

    with pytest.raises(InvalidCredentialsError):
        service.login("E001", "wrong-password")

    assert user.failed_login_count == 1
    assert user.locked_until is None


def test_unknown_employee_number_is_rejected_without_session() -> None:
    service, repository, session, _ = build_service(None)

    with pytest.raises(InvalidCredentialsError):
        service.login("missing", "any-password")

    assert repository.sessions == []
    session.commit.assert_not_called()


def test_refresh_rotates_credential_within_login_limit() -> None:
    user = make_user()
    service, repository, session, _ = build_service(user)
    login = service.login("E001", "correct-password")
    session.commit.reset_mock()

    refreshed = service.refresh(login.refresh_token)

    assert refreshed.refresh_token != login.refresh_token
    assert refreshed.session_id == login.session_id
    assert repository.sessions[0].current_refresh_generation == 2
    assert repository.credentials[0].consumed_at == NOW
    assert repository.credentials[1].generation == 2
    assert repository.credentials[1].token_digest == digest_token(refreshed.refresh_token)
    assert repository.credentials[1].expires_at == repository.sessions[0].absolute_expires_at
    assert refreshed.user is user
    session.commit.assert_called_once_with()


def test_reused_old_credential_revokes_the_session() -> None:
    user = make_user()
    service, repository, _, clock = build_service(user)
    login = service.login("E001", "correct-password")
    first_refresh = service.refresh(login.refresh_token)
    clock.advance(3600)

    with pytest.raises(SessionRevokedError):
        service.refresh(login.refresh_token)

    assert repository.sessions[0].revoked_at == clock.now
    assert repository.credentials[1].revoked_at == clock.now

    with pytest.raises(SessionRevokedError):
        service.refresh(first_refresh.refresh_token)


def test_duplicate_refresh_within_grace_keeps_the_session() -> None:
    user = make_user()
    service, repository, _, _ = build_service(user)
    login = service.login("E001", "correct-password")
    refreshed = service.refresh(login.refresh_token)

    with pytest.raises(RefreshInProgressError):
        service.refresh(login.refresh_token)

    assert repository.sessions[0].revoked_at is None

    rotated_again = service.refresh(refreshed.refresh_token)
    assert repository.sessions[0].current_refresh_generation == 3
    assert rotated_again.refresh_token not in {login.refresh_token, refreshed.refresh_token}


def test_reuse_without_grace_revokes_immediately() -> None:
    user = make_user()
    service, repository, _, _ = build_service(user, refresh_reuse_grace_seconds=0)
    login = service.login("E001", "correct-password")
    service.refresh(login.refresh_token)

    with pytest.raises(SessionRevokedError):
        service.refresh(login.refresh_token)

    assert repository.sessions[0].revoked_at == NOW


def test_refresh_rejects_expired_credential_row() -> None:
    user = make_user()
    service, repository, _, clock = build_service(user)
    login = service.login("E001", "correct-password")
    repository.credentials[0].expires_at = clock.now + timedelta(seconds=1)
    clock.advance(2)

    with pytest.raises(InvalidRefreshTokenError):
        service.refresh(login.refresh_token)


def test_refresh_revokes_session_after_work_end() -> None:
    user = make_user()
    service, repository, _, clock = build_service(user)
    login = service.login("E001", "correct-password")
    repository.sessions[0].work_ends_at = clock.now

    with pytest.raises(SessionRevokedError):
        service.refresh(login.refresh_token)

    assert repository.sessions[0].revoked_at == clock.now
    assert repository.credentials[0].revoked_at == clock.now


def test_refresh_rejects_expired_and_unknown_tokens() -> None:
    user = make_user()
    service, _, _, _ = build_service(user)
    settings = make_settings()
    expired = create_refresh_token(
        user_id=user.id,
        session_id=1,
        generation=1,
        expires_at=NOW - timedelta(seconds=1),
        secret=settings.jwt_secret.get_secret_value(),
        now=NOW - timedelta(days=8),
    )
    unknown = create_refresh_token(
        user_id=user.id,
        session_id=1,
        generation=1,
        expires_at=NOW + timedelta(days=7),
        secret=settings.jwt_secret.get_secret_value(),
        now=NOW,
    )

    with pytest.raises(InvalidRefreshTokenError):
        service.refresh(expired)
    with pytest.raises(InvalidRefreshTokenError):
        service.refresh(unknown)
    with pytest.raises(InvalidRefreshTokenError):
        service.refresh("not-a-jwt")


def test_logout_revokes_session_and_credential() -> None:
    user = make_user()
    service, repository, session, _ = build_service(user)
    login = service.login("E001", "correct-password")
    session.commit.reset_mock()

    service.logout(access_token=login.access_token, refresh_token=login.refresh_token)

    assert repository.sessions[0].revoked_at == NOW
    assert repository.credentials[0].revoked_at == NOW
    session.commit.assert_called_once_with()

    with pytest.raises(SessionRevokedError):
        service.refresh(login.refresh_token)


def test_logout_without_valid_cookies_does_nothing() -> None:
    user = make_user()
    service, repository, session, _ = build_service(user)

    service.logout(access_token="not-a-jwt", refresh_token=None)

    assert repository.sessions == []
    session.commit.assert_not_called()


def test_logout_uses_refresh_cookie_when_access_token_is_expired() -> None:
    user = make_user()
    service, repository, session, clock = build_service(user)
    login = service.login("E001", "correct-password")
    session.commit.reset_mock()
    clock.advance(3600)

    service.logout(access_token=login.access_token, refresh_token=login.refresh_token)

    assert repository.sessions[0].revoked_at == clock.now
    session.commit.assert_called_once_with()


def test_expired_temporary_password_is_rejected() -> None:
    user = make_user(
        must_change_password=True,
        temporary_password_expires_at=NOW - timedelta(seconds=1),
    )
    service, repository, session, _ = build_service(user)

    with pytest.raises(TemporaryPasswordExpiredError):
        service.login("E001", "correct-password")

    assert repository.sessions == []
    session.commit.assert_not_called()


def test_unexpired_temporary_password_logs_in() -> None:
    user = make_user(
        must_change_password=True,
        temporary_password_expires_at=NOW + timedelta(hours=1),
    )
    service, repository, _, _ = build_service(user)

    result = service.login("E001", "correct-password")

    assert result.user is user
    assert len(repository.sessions) == 1


def test_change_password_replaces_hash_and_clears_temporary_flag() -> None:
    user = make_user(must_change_password=True, version=3)
    service, _, session, _ = build_service(user)

    changed = service.change_password(
        user,
        current_password="correct-password",
        new_password="new-password",
    )

    assert changed is user
    assert verify_password("new-password", user.password_hash)
    assert not verify_password("correct-password", user.password_hash)
    assert user.must_change_password is False
    assert user.version == 4
    session.commit.assert_called_once_with()


def test_change_password_rejects_wrong_current_password() -> None:
    user = make_user()
    original_hash = user.password_hash
    service, _, session, _ = build_service(user)

    with pytest.raises(CurrentPasswordMismatchError):
        service.change_password(
            user,
            current_password="wrong-password",
            new_password="new-password",
        )

    assert user.password_hash == original_hash
    session.commit.assert_not_called()


def test_change_password_rejects_same_password() -> None:
    user = make_user()
    service, _, session, _ = build_service(user)

    with pytest.raises(PasswordUnchangedError):
        service.change_password(
            user,
            current_password="correct-password",
            new_password="correct-password",
        )

    session.commit.assert_not_called()


def test_login_sets_work_end_to_scheduled_shift_end() -> None:
    user = make_user(shift_end_local=time(23, 59))
    service, repository, _, clock = build_service(user)

    service.login("E001", "correct-password")

    local_now = clock.now.astimezone(ZoneInfo("Asia/Seoul"))
    expected = datetime.combine(
        local_now.date(), user.shift_end_local, tzinfo=ZoneInfo("Asia/Seoul")
    ).astimezone(UTC)
    assert repository.sessions[0].work_ends_at == expected
    assert repository.sessions[0].work_session_version == 1


def test_automatic_extension_is_limited_to_warning_window_and_once_per_end_time() -> None:
    user = make_user()
    service, repository, session, clock = build_service(user)
    login = service.login("E001", "correct-password")
    auth_session = repository.sessions[0]
    auth_session.work_ends_at = clock.now + timedelta(minutes=5)
    expected_ends_at = auth_session.work_ends_at
    session.commit.reset_mock()

    extended = service.extend_work_session(
        login.session_id,
        kind="automatic",
        expected_ends_at=expected_ends_at,
        requested_ends_at=None,
    )

    assert extended.work_ends_at == expected_ends_at + timedelta(hours=1)
    assert extended.auto_extended_for == expected_ends_at
    assert extended.work_session_version == 2
    assert repository.extensions[0].kind == "automatic"
    assert repository.extensions[0].previous_ends_at == expected_ends_at
    session.commit.assert_called_once_with()

    with pytest.raises(WorkSessionConflictError):
        service.extend_work_session(
            login.session_id,
            kind="automatic",
            expected_ends_at=expected_ends_at,
            requested_ends_at=None,
        )


def test_automatic_extension_is_rejected_before_warning_window() -> None:
    user = make_user()
    service, repository, _, clock = build_service(user)
    login = service.login("E001", "correct-password")
    repository.sessions[0].work_ends_at = clock.now + timedelta(minutes=11)

    with pytest.raises(WorkSessionExtensionNotAllowedError):
        service.extend_work_session(
            login.session_id,
            kind="automatic",
            expected_ends_at=repository.sessions[0].work_ends_at,
            requested_ends_at=None,
        )


def test_manual_extension_accepts_requested_future_time() -> None:
    user = make_user()
    service, repository, _, clock = build_service(user)
    login = service.login("E001", "correct-password")
    repository.sessions[0].work_ends_at = clock.now + timedelta(minutes=5)
    expected_ends_at = repository.sessions[0].work_ends_at
    requested = clock.now + timedelta(hours=2)

    extended = service.extend_work_session(
        login.session_id,
        kind="manual",
        expected_ends_at=expected_ends_at,
        requested_ends_at=requested,
    )

    assert extended.work_ends_at == requested
