from __future__ import annotations

import secrets
import string
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.models.master import AppUser
from app.repositories.auth import AuthRepository
from app.security.passwords import hash_password
from app.services.session_revocation import revoke_sessions_for_user

_TEMPORARY_PASSWORD_ALPHABET = string.ascii_letters + string.digits
_TEMPORARY_PASSWORD_LENGTH = 16

Clock = Callable[[], datetime]


def _utc_now() -> datetime:
    return datetime.now(UTC)


def generate_temporary_password() -> str:
    """Create a one-time password with at least one lowercase, uppercase, and digit."""
    required = [
        secrets.choice(string.ascii_lowercase),
        secrets.choice(string.ascii_uppercase),
        secrets.choice(string.digits),
    ]
    characters = required + [
        secrets.choice(_TEMPORARY_PASSWORD_ALPHABET)
        for _ in range(_TEMPORARY_PASSWORD_LENGTH - len(required))
    ]
    for index in range(len(characters) - 1, 0, -1):
        swap_index = secrets.randbelow(index + 1)
        characters[index], characters[swap_index] = characters[swap_index], characters[index]
    return "".join(characters)


class PasswordResetError(Exception):
    """Base exception for a rejected administrator password reset."""


class UserNotFoundError(PasswordResetError):
    """Raised when the target account does not exist or is soft-deleted."""


class SelfPasswordResetNotAllowedError(PasswordResetError):
    """Raised when an administrator targets their own account."""


@dataclass(frozen=True)
class PasswordResetResult:
    user: AppUser
    temporary_password: str


class PasswordResetService:
    """Issue a temporary password and retire the target account's login sessions."""

    def __init__(
        self,
        session: Session,
        repository: AuthRepository,
        clock: Clock = _utc_now,
    ) -> None:
        self._session = session
        self._repository = repository
        self._clock = clock

    def reset_password(self, actor: AppUser, user_id: int) -> PasswordResetResult:
        if actor.id == user_id:
            raise SelfPasswordResetNotAllowedError

        user = self._repository.find_active_user_for_update(user_id)
        if user is None:
            raise UserNotFoundError

        now = self._clock()
        temporary_password = generate_temporary_password()
        user.password_hash = hash_password(temporary_password)
        user.must_change_password = True
        user.version += 1
        user.failed_login_count = 0
        user.locked_until = None

        revoke_sessions_for_user(self._repository, user.id, now)

        self._session.commit()
        return PasswordResetResult(user=user, temporary_password=temporary_password)
