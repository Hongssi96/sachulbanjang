from collections.abc import Sequence

from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.orm import Session

from app.models.auth import AuthSession, RefreshCredential, WorkExtension
from app.models.master import AppUser


def _user_search_filters(
    *, query: str | None, role: str | None, include_inactive: bool
) -> list[ColumnElement[bool]]:
    conditions: list[ColumnElement[bool]] = []
    if not include_inactive:
        conditions.append(AppUser.deleted_at.is_(None))
    if role is not None:
        conditions.append(AppUser.role == role)
    if query:
        escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        conditions.append(
            or_(
                AppUser.employee_no.ilike(pattern, escape="\\"),
                AppUser.display_name.ilike(pattern, escape="\\"),
            )
        )
    return conditions


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

    def find_any_user_by_id(self, user_id: int) -> AppUser | None:
        """Include soft-deleted accounts so administrators can inspect them."""
        return self._session.scalar(select(AppUser).where(AppUser.id == user_id))

    def find_active_user_for_update(self, user_id: int) -> AppUser | None:
        """Lock an active account before an administrator changes its password."""
        return self._session.scalar(
            select(AppUser)
            .where(AppUser.id == user_id, AppUser.deleted_at.is_(None))
            .with_for_update()
        )

    def find_user_by_employee_no(self, employee_no: str) -> AppUser | None:
        """Include soft-deleted accounts because employee_no stays unique with them."""
        return self._session.scalar(select(AppUser).where(AppUser.employee_no == employee_no))

    def count_users(self, *, query: str | None, role: str | None, include_inactive: bool) -> int:
        conditions = _user_search_filters(query=query, role=role, include_inactive=include_inactive)
        return (
            self._session.scalar(select(func.count()).select_from(AppUser).where(*conditions)) or 0
        )

    def find_users(
        self,
        *,
        query: str | None,
        role: str | None,
        include_inactive: bool,
        offset: int,
        limit: int,
    ) -> list[AppUser]:
        conditions = _user_search_filters(query=query, role=role, include_inactive=include_inactive)
        return list(
            self._session.scalars(
                select(AppUser)
                .where(*conditions)
                .order_by(AppUser.employee_no.asc(), AppUser.id.asc())
                .offset(offset)
                .limit(limit)
            )
        )

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

    def find_session(self, session_id: int) -> AuthSession | None:
        return self._session.get(AuthSession, session_id)

    def find_sessions_for_update(self, user_id: int) -> list[AuthSession]:
        return list(
            self._session.scalars(
                select(AuthSession).where(AuthSession.user_id == user_id).with_for_update()
            )
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

    def find_credentials_for_update(self, session_ids: Sequence[int]) -> list[RefreshCredential]:
        if not session_ids:
            return []
        return list(
            self._session.scalars(
                select(RefreshCredential)
                .where(RefreshCredential.session_id.in_(session_ids))
                .with_for_update()
            )
        )

    def add_refresh_credential(self, credential: RefreshCredential) -> None:
        self._session.add(credential)

    def add_work_extension(self, extension: WorkExtension) -> None:
        self._session.add(extension)
