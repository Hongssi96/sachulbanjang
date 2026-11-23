from collections.abc import Sequence
from datetime import UTC, datetime, timedelta

from app.models.auth import AuthSession, RefreshCredential
from app.repositories.auth import AuthRepository
from app.services.session_revocation import revoke_sessions_for_user

NOW = datetime.now(UTC)


def make_session(session_id: int, user_id: int) -> AuthSession:
    return AuthSession(
        id=session_id,
        user_id=user_id,
        absolute_expires_at=NOW + timedelta(days=7),
        work_ends_at=NOW + timedelta(hours=8),
        work_session_version=1,
        current_refresh_generation=1,
    )


def make_credential(credential_id: int, session_id: int) -> RefreshCredential:
    return RefreshCredential(
        id=credential_id,
        session_id=session_id,
        token_digest=f"{credential_id:064d}",
        generation=1,
        expires_at=NOW + timedelta(days=7),
    )


class FakeSessionRepository(AuthRepository):
    def __init__(self) -> None:
        self.sessions: list[AuthSession] = []
        self.credentials: list[RefreshCredential] = []

    def find_sessions_for_update(self, user_id: int) -> list[AuthSession]:
        return [auth_session for auth_session in self.sessions if auth_session.user_id == user_id]

    def find_credentials_for_update(self, session_ids: Sequence[int]) -> list[RefreshCredential]:
        wanted = set(session_ids)
        return [credential for credential in self.credentials if credential.session_id in wanted]


def test_revoke_sessions_marks_only_the_target_account() -> None:
    repository = FakeSessionRepository()
    repository.sessions = [make_session(1, 7), make_session(2, 7), make_session(3, 8)]
    repository.credentials = [
        make_credential(1, 1),
        make_credential(2, 2),
        make_credential(3, 3),
    ]

    revoke_sessions_for_user(repository, 7, NOW)

    assert repository.sessions[0].revoked_at == NOW
    assert repository.sessions[1].revoked_at == NOW
    assert repository.sessions[2].revoked_at is None
    assert repository.credentials[0].revoked_at == NOW
    assert repository.credentials[1].revoked_at == NOW
    assert repository.credentials[2].revoked_at is None


def test_revoke_sessions_keeps_existing_revocation_time() -> None:
    repository = FakeSessionRepository()
    already_revoked = make_session(1, 7)
    already_revoked.revoked_at = NOW - timedelta(hours=1)
    repository.sessions = [already_revoked]
    credential = make_credential(1, 1)
    credential.revoked_at = NOW - timedelta(hours=1)
    repository.credentials = [credential]

    revoke_sessions_for_user(repository, 7, NOW)

    assert already_revoked.revoked_at == NOW - timedelta(hours=1)
    assert credential.revoked_at == NOW - timedelta(hours=1)
