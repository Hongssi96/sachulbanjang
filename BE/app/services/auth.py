from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models.auth import AuthSession, RefreshCredential, WorkExtension
from app.models.master import AppUser
from app.repositories.auth import AuthRepository
from app.security.passwords import dummy_password_hash, hash_password, verify_password
from app.security.tokens import (
    TokenError,
    TokenExpiredError,
    create_access_token,
    create_refresh_token,
    decode_access_token,
    decode_refresh_token,
    digest_token,
)

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


class RefreshRejectedError(LoginError):
    """Base exception for a refresh request that cannot issue new tokens."""


class InvalidRefreshTokenError(RefreshRejectedError):
    """Raised when the refresh token is malformed, expired, or unknown."""


class SessionRevokedError(RefreshRejectedError):
    """Raised when the login session is ended or retired by a reused token."""


class RefreshInProgressError(RefreshRejectedError):
    """Raised for a duplicated refresh request that must not end the session."""


class CurrentPasswordMismatchError(Exception):
    """Raised when a password change does not prove the current password."""


class PasswordUnchangedError(Exception):
    """Raised when the requested password is the same as the current password."""


class WorkSessionExtensionError(Exception):
    """Base exception for a rejected work-session extension."""


class WorkSessionConflictError(WorkSessionExtensionError):
    """Raised when another tab already changed the expected end time."""


class WorkSessionExtensionNotAllowedError(WorkSessionExtensionError):
    """Raised when an extension violates the allowed time window."""


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
            work_ends_at=self._initial_work_end(user, now, absolute_expires_at),
            work_session_version=1,
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

    def refresh(self, refresh_token: str) -> LoginResult:
        """Rotate the refresh credential without extending the login's 7-day limit."""
        now = self._clock()
        try:
            claims = decode_refresh_token(refresh_token, secret=self._secret)
        except TokenExpiredError:
            raise InvalidRefreshTokenError("refresh token expired") from None
        except TokenError:
            raise InvalidRefreshTokenError("invalid refresh token") from None

        credential = self._repository.find_credential_for_update(digest_token(refresh_token))
        if (
            credential is None
            or credential.session_id != claims.session_id
            or credential.generation != claims.generation
        ):
            raise InvalidRefreshTokenError("refresh credential not found")

        auth_session = self._repository.find_session_for_update(claims.session_id)
        if auth_session is None or auth_session.user_id != claims.user_id:
            raise InvalidRefreshTokenError("login session not found")
        if (
            auth_session.revoked_at is not None
            or auth_session.absolute_expires_at <= now
            or auth_session.work_ends_at <= now
        ):
            if auth_session.revoked_at is None:
                self._revoke_session(auth_session, now)
                self._session.commit()
            raise SessionRevokedError("login session is no longer active")
        if credential.expires_at <= now:
            raise InvalidRefreshTokenError("refresh credential expired")

        if credential.revoked_at is not None or credential.consumed_at is not None:
            self._reject_replayed_credential(auth_session, credential, now)
            raise SessionRevokedError("refresh credential was already used")

        user = self._repository.find_active_user_by_id(auth_session.user_id)
        if user is None:
            raise InvalidRefreshTokenError("account is not active")

        return self._rotate_credential(auth_session, credential, user, now)

    def logout(self, *, access_token: str | None, refresh_token: str | None) -> None:
        """End the login session of the presented cookies. Ignores unknown sessions."""
        session_id = self._resolve_session_id(access_token, refresh_token)
        if session_id is None:
            return

        auth_session = self._repository.find_session_for_update(session_id)
        if auth_session is None or auth_session.revoked_at is not None:
            return

        self._revoke_session(auth_session, self._clock())
        self._session.commit()

    def change_password(
        self, user: AppUser, *, current_password: str, new_password: str
    ) -> AppUser:
        """Change the authenticated user's password after verifying the old value."""
        if not verify_password(current_password, user.password_hash):
            raise CurrentPasswordMismatchError
        if verify_password(new_password, user.password_hash):
            raise PasswordUnchangedError

        user.password_hash = hash_password(new_password)
        user.must_change_password = False
        user.version += 1
        self._session.commit()
        return user

    def get_work_session(self, session_id: int) -> AuthSession:
        auth_session = self._repository.find_session(session_id)
        if auth_session is None or auth_session.revoked_at is not None:
            raise SessionRevokedError("login session is no longer active")
        now = self._clock()
        if auth_session.absolute_expires_at <= now or auth_session.work_ends_at <= now:
            raise SessionRevokedError("work session ended")
        return auth_session

    def extend_work_session(
        self,
        session_id: int,
        *,
        kind: str,
        expected_ends_at: datetime,
        requested_ends_at: datetime | None,
    ) -> AuthSession:
        now = self._clock()
        auth_session = self._repository.find_session_for_update(session_id)
        if auth_session is None or auth_session.revoked_at is not None:
            raise SessionRevokedError("login session is no longer active")
        if auth_session.work_ends_at != expected_ends_at:
            raise WorkSessionConflictError
        if auth_session.work_ends_at <= now or auth_session.absolute_expires_at <= now:
            self._revoke_session(auth_session, now)
            self._session.commit()
            raise SessionRevokedError("work session ended")

        previous_ends_at = auth_session.work_ends_at
        if kind == "automatic":
            warning_starts_at = auth_session.work_ends_at - timedelta(minutes=10)
            if now < warning_starts_at or auth_session.auto_extended_for == expected_ends_at:
                raise WorkSessionExtensionNotAllowedError
            new_ends_at = auth_session.work_ends_at + timedelta(hours=1)
            auth_session.auto_extended_for = expected_ends_at
        else:
            new_ends_at = requested_ends_at or auth_session.work_ends_at + timedelta(hours=1)

        new_ends_at = min(new_ends_at, auth_session.absolute_expires_at)
        if new_ends_at <= auth_session.work_ends_at:
            raise WorkSessionExtensionNotAllowedError
        auth_session.work_ends_at = new_ends_at
        auth_session.work_session_version += 1
        self._repository.add_work_extension(
            WorkExtension(
                session_id=auth_session.id,
                actor_id=auth_session.user_id,
                previous_ends_at=previous_ends_at,
                new_ends_at=new_ends_at,
                kind=kind,
            )
        )
        self._session.commit()
        return auth_session

    @staticmethod
    def _initial_work_end(user: AppUser, now: datetime, absolute_expires_at: datetime) -> datetime:
        korea = ZoneInfo("Asia/Seoul")
        local_now = now.astimezone(korea)
        scheduled = datetime.combine(local_now.date(), user.shift_end_local, tzinfo=korea)
        work_end = scheduled if local_now < scheduled else local_now + timedelta(hours=1)
        return min(work_end.astimezone(UTC), absolute_expires_at)

    def _reject_replayed_credential(
        self, auth_session: AuthSession, credential: RefreshCredential, now: datetime
    ) -> None:
        consumed_at = credential.consumed_at
        is_duplicate_request = (
            consumed_at is not None
            and now - consumed_at < timedelta(seconds=self._settings.refresh_reuse_grace_seconds)
            and credential.generation == auth_session.current_refresh_generation - 1
        )
        if is_duplicate_request:
            raise RefreshInProgressError("another refresh of this session is already in progress")

        self._revoke_session(auth_session, now)
        self._session.commit()

    def _revoke_session(self, auth_session: AuthSession, now: datetime) -> None:
        auth_session.revoked_at = now
        current = self._repository.find_credential(
            auth_session.id, auth_session.current_refresh_generation
        )
        if current is not None and current.revoked_at is None:
            current.revoked_at = now

    def _rotate_credential(
        self,
        auth_session: AuthSession,
        credential: RefreshCredential,
        user: AppUser,
        now: datetime,
    ) -> LoginResult:
        generation = credential.generation + 1
        expires_at = min(
            auth_session.absolute_expires_at,
            now + timedelta(seconds=self._settings.refresh_token_ttl_seconds),
        )
        credential.consumed_at = now
        auth_session.current_refresh_generation = generation

        refresh_token = create_refresh_token(
            user_id=user.id,
            session_id=auth_session.id,
            generation=generation,
            expires_at=expires_at,
            secret=self._secret,
            now=now,
        )
        self._repository.add_refresh_credential(
            RefreshCredential(
                session_id=auth_session.id,
                token_digest=digest_token(refresh_token),
                generation=generation,
                expires_at=expires_at,
            )
        )
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

    def _resolve_session_id(
        self, access_token: str | None, refresh_token: str | None
    ) -> int | None:
        if access_token is not None:
            try:
                return decode_access_token(access_token, secret=self._secret).session_id
            except TokenError:
                pass
        if refresh_token is not None:
            try:
                return decode_refresh_token(refresh_token, secret=self._secret).session_id
            except TokenError:
                pass
        return None
