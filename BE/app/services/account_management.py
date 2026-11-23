from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, time, timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models.account_audit import AccountAuditEvent
from app.models.master import AppUser
from app.repositories.account_audit import AccountAuditRepository
from app.repositories.auth import AuthRepository
from app.security.passwords import hash_password
from app.services.password_reset import UserNotFoundError, generate_temporary_password
from app.services.session_revocation import revoke_sessions_for_user

Clock = Callable[[], datetime]


def _utc_now() -> datetime:
    return datetime.now(UTC)


class EmployeeNumberAlreadyExistsError(Exception):
    """Raised when an employee number is already reserved, including by a deleted account."""


class UserVersionConflictError(Exception):
    """Raised when an account edit is based on an outdated version."""

    def __init__(self, current_version: int) -> None:
        self.current_version = current_version
        super().__init__("account was changed by another request")


class SelfRoleChangeNotAllowedError(Exception):
    """Raised when an administrator changes their own role."""


class LastAdminRequiredError(Exception):
    """Raised when an edit would leave no active administrator."""


class AccountAlreadyInactiveError(Exception):
    """Raised when a deactivation targets an account that is already inactive."""


class AccountAlreadyActiveError(Exception):
    """Raised when a reactivation targets an account that is still active."""


class SelfDeactivationNotAllowedError(Exception):
    """Raised when an administrator deactivates their own account."""


@dataclass(frozen=True)
class UpdateUserCommand:
    version: int
    display_name: str | None = None
    role: str | None = None
    shift_start_local: time | None = None
    shift_end_local: time | None = None


@dataclass(frozen=True)
class CreateUserCommand:
    employee_no: str
    display_name: str
    role: str
    shift_start_local: time
    shift_end_local: time


@dataclass(frozen=True)
class CreateUserResult:
    user: AppUser
    temporary_password: str


@dataclass(frozen=True)
class UserListResult:
    users: list[AppUser]
    total_items: int


@dataclass(frozen=True)
class AuditEventListResult:
    events: list[tuple[AccountAuditEvent, str]]
    total_items: int


class AccountManagementService:
    """Create administrator-managed accounts with one-time temporary credentials."""

    def __init__(
        self,
        session: Session,
        repository: AuthRepository,
        settings: Settings,
        audit_repository: AccountAuditRepository,
        clock: Clock = _utc_now,
    ) -> None:
        self._session = session
        self._repository = repository
        self._settings = settings
        self._audit_repository = audit_repository
        self._clock = clock

    def _record(
        self,
        *,
        user_id: int,
        actor_id: int,
        action: str,
        detail: dict[str, object] | None = None,
    ) -> None:
        self._audit_repository.add_event(
            AccountAuditEvent(
                user_id=user_id,
                actor_id=actor_id,
                action=action,
                detail=detail,
            )
        )

    def list_users(
        self,
        *,
        query: str | None,
        role: str | None,
        include_inactive: bool,
        page: int,
        page_size: int,
    ) -> UserListResult:
        normalized_query = query.strip() if query is not None else ""
        total_items = self._repository.count_users(
            query=normalized_query or None,
            role=role,
            include_inactive=include_inactive,
        )
        users = self._repository.find_users(
            query=normalized_query or None,
            role=role,
            include_inactive=include_inactive,
            offset=(page - 1) * page_size,
            limit=page_size,
        )
        return UserListResult(users=users, total_items=total_items)

    def get_user(self, user_id: int) -> AppUser:
        user = self._repository.find_any_user_by_id(user_id)
        if user is None:
            raise UserNotFoundError
        return user

    def deactivate_user(self, actor: AppUser, user_id: int, version: int) -> AppUser:
        user = self._repository.find_any_user_for_update(user_id)
        if user is None:
            raise UserNotFoundError
        if user.version != version:
            raise UserVersionConflictError(user.version)
        if user.deleted_at is not None:
            raise AccountAlreadyInactiveError
        if actor.id == user.id:
            raise SelfDeactivationNotAllowedError
        if user.role == "admin" and self._repository.count_other_active_admins(user.id) == 0:
            raise LastAdminRequiredError

        now = self._clock()
        user.deleted_at = now
        user.version += 1
        revoke_sessions_for_user(self._repository, user.id, now)
        self._record(
            user_id=user.id,
            actor_id=actor.id,
            action="user_deactivated",
            detail={"previous_role": user.role},
        )
        self._session.commit()
        return user

    def reactivate_user(self, actor: AppUser, user_id: int, version: int) -> AppUser:
        user = self._repository.find_any_user_for_update(user_id)
        if user is None:
            raise UserNotFoundError
        if user.version != version:
            raise UserVersionConflictError(user.version)
        if user.deleted_at is None:
            raise AccountAlreadyActiveError

        user.deleted_at = None
        user.version += 1
        self._record(user_id=user.id, actor_id=actor.id, action="user_reactivated")
        self._session.commit()
        return user

    def update_user(self, actor: AppUser, user_id: int, command: UpdateUserCommand) -> AppUser:
        user = self._repository.find_any_user_for_update(user_id)
        if user is None:
            raise UserNotFoundError
        if user.version != command.version:
            raise UserVersionConflictError(user.version)

        if command.role is not None and command.role != user.role:
            if actor.id == user.id:
                raise SelfRoleChangeNotAllowedError
            if (
                user.role == "admin"
                and command.role != "admin"
                and self._repository.count_other_active_admins(user.id) == 0
            ):
                raise LastAdminRequiredError

        changes: dict[str, dict[str, str]] = {}
        if command.display_name is not None and command.display_name != user.display_name:
            changes["display_name"] = {"before": user.display_name, "after": command.display_name}
        if command.role is not None and command.role != user.role:
            changes["role"] = {"before": user.role, "after": command.role}
        if (
            command.shift_start_local is not None
            and command.shift_start_local != user.shift_start_local
        ):
            changes["shift_start_local"] = {
                "before": user.shift_start_local.isoformat(),
                "after": command.shift_start_local.isoformat(),
            }
        if command.shift_end_local is not None and command.shift_end_local != user.shift_end_local:
            changes["shift_end_local"] = {
                "before": user.shift_end_local.isoformat(),
                "after": command.shift_end_local.isoformat(),
            }

        if command.display_name is not None:
            user.display_name = command.display_name
        if command.role is not None:
            user.role = command.role
        if command.shift_start_local is not None:
            user.shift_start_local = command.shift_start_local
        if command.shift_end_local is not None:
            user.shift_end_local = command.shift_end_local
        user.version += 1

        self._record(
            user_id=user.id,
            actor_id=actor.id,
            action="user_updated",
            detail={"changes": changes},
        )
        self._session.commit()
        return user

    def create_user(self, actor: AppUser, command: CreateUserCommand) -> CreateUserResult:
        if self._repository.find_user_by_employee_no(command.employee_no) is not None:
            raise EmployeeNumberAlreadyExistsError

        temporary_password = generate_temporary_password()
        user = AppUser(
            employee_no=command.employee_no,
            display_name=command.display_name,
            password_hash=hash_password(temporary_password),
            role=command.role,
            must_change_password=True,
            temporary_password_expires_at=self._clock()
            + timedelta(seconds=self._settings.temporary_password_ttl_seconds),
            shift_start_local=command.shift_start_local,
            shift_end_local=command.shift_end_local,
        )
        try:
            self._repository.add_user(user)
            self._record(
                user_id=user.id,
                actor_id=actor.id,
                action="user_created",
                detail={"employee_no": user.employee_no, "role": user.role},
            )
            self._session.commit()
        except IntegrityError:
            self._session.rollback()
            raise EmployeeNumberAlreadyExistsError from None
        return CreateUserResult(user=user, temporary_password=temporary_password)

    def list_audit_events(self, user_id: int, *, page: int, page_size: int) -> AuditEventListResult:
        if self._repository.find_any_user_by_id(user_id) is None:
            raise UserNotFoundError
        total_items = self._audit_repository.count_for_user(user_id)
        events = self._audit_repository.find_for_user(
            user_id, offset=(page - 1) * page_size, limit=page_size
        )
        return AuditEventListResult(events=events, total_items=total_items)
