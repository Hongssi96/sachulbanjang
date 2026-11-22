from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.auth import AuthSession, RefreshCredential
from app.models.master import AppUser


class AuthRepository:
    """Data access used by login and token refresh."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def find_active_user_for_login(self, employee_no: str) -> AppUser | None:
        """Lock the account row so concurrent failures cannot lose lock counts."""
        return self._session.scalar(
            select(AppUser)
            .where(AppUser.employee_no == employee_no, AppUser.deleted_at.is_(None))
            .with_for_update()
        )

    def find_active_user_by_id(self, user_id: int) -> AppUser | None:
        return self._session.scalar(
            select(AppUser).where(AppUser.id == user_id, AppUser.deleted_at.is_(None))
        )

    def find_user_by_employee_no(self, employee_no: str) -> AppUser | None:
        """Include soft-deleted accounts because employee_no stays unique with them."""
        return self._session.scalar(select(AppUser).where(AppUser.employee_no == employee_no))

    def add_user(self, user: AppUser) -> None:
        self._session.add(user)
        self._session.flush()

    def add_session(self, auth_session: AuthSession) -> None:
        self._session.add(auth_session)
        self._session.flush()

    def find_session_for_update(self, session_id: int) -> AuthSession | None:
        return self._session.scalar(
            select(AuthSession).where(AuthSession.id == session_id).with_for_update()
        )

    def find_credential_for_update(self, token_digest: str) -> RefreshCredential | None:
        return self._session.scalar(
            select(RefreshCredential)
            .where(RefreshCredential.token_digest == token_digest)
            .with_for_update()
        )

    def find_credential(self, session_id: int, generation: int) -> RefreshCredential | None:
        return self._session.scalar(
            select(RefreshCredential).where(
                RefreshCredential.session_id == session_id,
                RefreshCredential.generation == generation,
            )
        )

    def add_refresh_credential(self, credential: RefreshCredential) -> None:
        self._session.add(credential)
