from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.account_audit import AccountAuditEvent
from app.models.master import AppUser


class AccountAuditRepository:
    """Read and write the administrator action trail."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def add_event(self, event: AccountAuditEvent) -> None:
        self._session.add(event)

    def count_for_user(self, user_id: int) -> int:
        return (
            self._session.scalar(
                select(func.count())
                .select_from(AccountAuditEvent)
                .where(AccountAuditEvent.user_id == user_id)
            )
            or 0
        )

    def find_for_user(
        self, user_id: int, *, offset: int, limit: int
    ) -> list[tuple[AccountAuditEvent, str]]:
        rows = self._session.execute(
            select(AccountAuditEvent, AppUser.display_name)
            .join(AppUser, AppUser.id == AccountAuditEvent.actor_id)
            .where(AccountAuditEvent.user_id == user_id)
            .order_by(AccountAuditEvent.created_at.desc(), AccountAuditEvent.id.desc())
            .offset(offset)
            .limit(limit)
        )
        return [(event, actor_name) for event, actor_name in rows]
