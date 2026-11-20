from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models.auth import AuthSession, RefreshCredential
from app.models.master import AppUser
from app.repositories.auth import AuthRepository
from app.security.passwords import dummy_password_hash, verify_password
from app.security.tokens import create_access_token, create_refresh_token, digest_token

Clock = Callable[[], datetime]


def _utc_now() -> datetime:
    return datetime.now(UTC)


class LoginError(Exception):
    """Base exception for rejected logins."""


class InvalidCredentialsError(LoginError):
    """Raised for an unknown employee number or a wrong password."""


class AccountLockedError(LoginError):
    """Raised while consecutive login failures keep the account locked."""

    def __init__(self, locked_until: datetime) -> None:
        self.locked_until = locked_until
        super().__init__("account is temporarily locked")


@dataclass(frozen=True)
class LoginResult:
    user: AppUser
    session_id: int
    access_token: str
    refresh_token: str


class AuthService:
    """Verify credentials and start a login session with rotating refresh tokens."""

    def __init__(
        self,
        session: Session,
        repository: AuthRepository,
        settings: Settings,
        clock: Clock = _utc_now,
    ) -> None:
        self._session = session
        self._repository = repository
        self._settings = settings
        self._secret = settings.jwt_secret.get_secret_value()
        self._clock = clock

    def login(self, employee_no: str, password: str) -> LoginResult:
        now = self._clock()
        user = self._repository.find_active_user_for_login(employee_no)
        if user is None:
            # Keep unknown accounts as slow as wrong passwords.
            verify_password(password, dummy_password_hash())
            raise InvalidCredentialsError

        locked_until = user.locked_until
        if locked_until is not None:
            if locked_until > now:
                raise AccountLockedError(locked_until)
            user.failed_login_count = 0
            user.locked_until = None

        if not verify_password(password, user.password_hash):
            self._record_failure(user, now)
            raise InvalidCredentialsError

        return self._start_session(user, now)

    def _record_failure(self, user: AppUser, now: datetime) -> None:
        user.failed_login_count += 1
        locked_until: datetime | None = None
        if user.failed_login_count >= self._settings.login_max_failures:
            locked_until = now + timedelta(seconds=self._settings.login_lock_seconds)
            user.locked_until = locked_until
        self._session.commit()
        if locked_until is not None:
            raise AccountLockedError(locked_until)

    def _start_session(self, user: AppUser, now: datetime) -> LoginResult:
        absolute_expires_at = now + timedelta(seconds=self._settings.refresh_token_ttl_seconds)
        auth_session = AuthSession(
            user_id=user.id,
            absolute_expires_at=absolute_expires_at,
            current_refresh_generation=1,
        )
        self._repository.add_session(auth_session)

        refresh_token = create_refresh_token(
            user_id=user.id,
            session_id=auth_session.id,
            generation=1,
            expires_at=absolute_expires_at,
            secret=self._secret,
            now=now,
        )
        self._repository.add_refresh_credential(
            RefreshCredential(
                session_id=auth_session.id,
                token_digest=digest_token(refresh_token),
                generation=1,
                expires_at=absolute_expires_at,
            )
        )

        user.failed_login_count = 0
        user.locked_until = None
        self._session.commit()

        access_token = create_access_token(
            user_id=user.id,
            session_id=auth_session.id,
            role=user.role,
            secret=self._secret,
            ttl_seconds=self._settings.access_token_ttl_seconds,
            now=now,
        )
        return LoginResult(
            user=user,
            session_id=auth_session.id,
            access_token=access_token,
            refresh_token=refresh_token,
        )
