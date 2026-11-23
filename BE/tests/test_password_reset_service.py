from collections.abc import Sequence
from datetime import UTC, datetime, time, timedelta
from unittest.mock import MagicMock

import pytest
from app.core.config import Settings
from app.models.auth import AuthSession, RefreshCredential
from app.models.master import AppUser
from app.repositories.account_audit import AccountAuditRepository
from app.repositories.auth import AuthRepository
from app.security.passwords import hash_password, verify_password
from app.services.password_reset import (
    PasswordResetService,
    SelfPasswordResetNotAllowedError,
    UserNotFoundError,
    generate_temporary_password,
)
from sqlalchemy.orm import Session

NOW = datetime.now(UTC)


def make_user(user_id: int = 1, **overrides: object) -> AppUser:
    values: dict[str, object] = {
        "id": user_id,
        "employee_no": f"E{user_id:03d}",
        "display_name": "테스트 사용자",
        "password_hash": hash_password("old-password"),
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


def make_session(session_id: int, user_id: int) -> AuthSession:
    return AuthSession(
        id=session_id,
        user_id=user_id,
        absolute_expires_at=NOW + timedelta(days=7),
        work_ends_at=NOW + timedelta(hours=8),
        work_session_version=1,
        current_refresh_generation=1,
    )


def make_credential(
    credential_id: int,
    session_id: int,
    generation: int,
    *,
    consumed_at: datetime | None = None,
) -> RefreshCredential:
    return RefreshCredential(
        id=credential_id,
        session_id=session_id,
        token_digest=f"{credential_id:064d}",
        generation=generation,
        expires_at=NOW + timedelta(days=7),
        consumed_at=consumed_at,
    )


class FakePasswordResetRepository(AuthRepository):
    def __init__(self, user: AppUser | None) -> None:
        self.user = user
        self.sessions: list[AuthSession] = []
        self.credentials: list[RefreshCredential] = []

    def find_active_user_for_update(self, user_id: int) -> AppUser | None:
        if self.user is not None and self.user.id == user_id:
            return self.user
        return None

    def find_sessions_for_update(self, user_id: int) -> list[AuthSession]:
        return [auth_session for auth_session in self.sessions if auth_session.user_id == user_id]

    def find_credentials_for_update(self, session_ids: Sequence[int]) -> list[RefreshCredential]:
        wanted = set(session_ids)
        return [credential for credential in self.credentials if credential.session_id in wanted]


def make_settings(*, temporary_password_ttl_seconds: int = 86400) -> Settings:
    return Settings(
        _env_file=None,
        database_url="postgresql+psycopg://user:password@localhost/database",
        jwt_secret="test-secret-that-is-at-least-32-characters",
        temporary_password_ttl_seconds=temporary_password_ttl_seconds,
    )


def build_service(
    user: AppUser | None,
) -> tuple[PasswordResetService, FakePasswordResetRepository, MagicMock]:
    session = MagicMock(spec=Session)
    repository = FakePasswordResetRepository(user)
    service = PasswordResetService(
        session,
        repository,
        make_settings(),
        MagicMock(spec=AccountAuditRepository),
        clock=lambda: NOW,
    )
    return service, repository, session


def test_reset_replaces_password_and_revokes_all_login_credentials() -> None:
    target = make_user(
        version=3,
        failed_login_count=4,
        locked_until=NOW + timedelta(minutes=5),
    )
    actor = make_user(user_id=99, role="admin")
    service, repository, session = build_service(target)
    repository.sessions = [make_session(10, target.id), make_session(11, target.id)]
    repository.credentials = [
        make_credential(1, 10, 1, consumed_at=NOW - timedelta(minutes=1)),
        make_credential(2, 10, 2),
        make_credential(3, 11, 1),
        make_credential(4, 12, 1),
    ]

    result = service.reset_password(actor, target.id)

    assert result.user is target
    assert verify_password(result.temporary_password, target.password_hash)
    assert not verify_password("old-password", target.password_hash)
    assert target.must_change_password is True
    assert target.temporary_password_expires_at == NOW + timedelta(seconds=86400)
    assert target.version == 4
    assert target.failed_login_count == 0
    assert target.locked_until is None
    assert all(auth_session.revoked_at == NOW for auth_session in repository.sessions)
    assert all(credential.revoked_at == NOW for credential in repository.credentials[:3])
    assert repository.credentials[3].revoked_at is None
    session.commit.assert_called_once_with()


def test_reset_rejects_the_administrators_own_account() -> None:
    actor = make_user(user_id=1, role="admin")
    original_hash = actor.password_hash
    service, _, session = build_service(actor)

    with pytest.raises(SelfPasswordResetNotAllowedError):
        service.reset_password(actor, actor.id)

    assert actor.password_hash == original_hash
    assert actor.must_change_password is False
    assert actor.version == 1
    session.commit.assert_not_called()


def test_reset_rejects_a_missing_or_deleted_account() -> None:
    actor = make_user(user_id=99, role="admin")
    service, _, session = build_service(None)

    with pytest.raises(UserNotFoundError):
        service.reset_password(actor, 2)

    session.commit.assert_not_called()


def test_reset_keeps_sessions_of_other_users() -> None:
    target = make_user(user_id=2)
    actor = make_user(user_id=99, role="admin")
    service, repository, _ = build_service(target)
    repository.sessions = [make_session(20, target.id), make_session(21, 3)]
    repository.credentials = [
        make_credential(5, 20, 1),
        make_credential(6, 21, 1),
    ]

    service.reset_password(actor, target.id)

    assert repository.sessions[0].revoked_at == NOW
    assert repository.sessions[1].revoked_at is None
    assert repository.credentials[0].revoked_at == NOW
    assert repository.credentials[1].revoked_at is None


def test_reset_uses_configured_temporary_password_ttl() -> None:
    target = make_user()
    actor = make_user(user_id=99, role="admin")
    session = MagicMock(spec=Session)
    repository = FakePasswordResetRepository(target)
    service = PasswordResetService(
        session,
        repository,
        make_settings(temporary_password_ttl_seconds=3600),
        MagicMock(spec=AccountAuditRepository),
        clock=lambda: NOW,
    )

    service.reset_password(actor, target.id)

    assert target.temporary_password_expires_at == NOW + timedelta(seconds=3600)


def test_temporary_password_has_required_length_and_characters() -> None:
    for _ in range(10):
        password = generate_temporary_password()
        assert len(password) == 16
        assert any(character.islower() for character in password)
        assert any(character.isupper() for character in password)
        assert any(character.isdigit() for character in password)
