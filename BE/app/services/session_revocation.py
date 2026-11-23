from datetime import datetime

from app.repositories.auth import AuthRepository


def revoke_sessions_for_user(repository: AuthRepository, user_id: int, now: datetime) -> None:
    """Revoke every login session and refresh credential of one account.

    The caller owns the transaction, so this only marks rows and never commits.
    """
    sessions = repository.find_sessions_for_update(user_id)
    credentials = repository.find_credentials_for_update(
        [auth_session.id for auth_session in sessions]
    )
    for auth_session in sessions:
        if auth_session.revoked_at is None:
            auth_session.revoked_at = now
    for credential in credentials:
        if credential.revoked_at is None:
            credential.revoked_at = now
