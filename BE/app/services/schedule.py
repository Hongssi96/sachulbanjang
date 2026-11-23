from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, date, datetime

from sqlalchemy.orm import Session

from app.models.master import AppUser
from app.models.schedule import Schedule
from app.repositories.schedule import ScheduleRepository, ScheduleView
from app.services.record_history import period_bounds

Clock = Callable[[], datetime]

_EDITABLE_FIELDS = {
    "title",
    "category",
    "description",
    "all_day",
    "start_date",
    "end_date_exclusive",
    "starts_at",
    "ends_at",
}


def _utc_now() -> datetime:
    return datetime.now(UTC)


class ScheduleError(Exception):
    """Base exception for rejected schedule operations."""


class ScheduleNotFoundError(ScheduleError):
    """Raised when a schedule does not exist or is soft-deleted."""


class ScheduleVersionConflictError(ScheduleError):
    """Raised when a change is based on an outdated schedule version."""

    def __init__(self, current_version: int) -> None:
        self.current_version = current_version
        super().__init__("schedule was changed by another request")


class ScheduleForbiddenError(ScheduleError):
    """Raised when a worker edits or deletes another author's schedule."""


class InvalidScheduleError(ScheduleError):
    """Raised when the requested schedule body is inconsistent."""


@dataclass(frozen=True)
class SchedulePage:
    schedules: list[ScheduleView]
    total_items: int


class ScheduleService:
    """Schedule CRUD with author/admin permissions and dual time representations."""

    def __init__(
        self,
        session: Session,
        repository: ScheduleRepository,
        clock: Clock = _utc_now,
    ) -> None:
        self._session = session
        self._repository = repository
        self._clock = clock

    def create_schedule(
        self,
        author: AppUser,
        *,
        fields: Mapping[str, object],
    ) -> ScheduleView:
        schedule = Schedule(author_id=author.id, version=1, **dict(fields))
        self._repository.add_schedule(schedule)
        self._session.commit()
        return self._visible(schedule.id)

    def list_schedules(
        self,
        *,
        date_from: date | None,
        date_to: date | None,
        page: int,
        page_size: int,
    ) -> SchedulePage:
        from_instant, to_instant = period_bounds(date_from, date_to)
        total_items = self._repository.count_schedules(
            from_date=date_from,
            to_date=date_to,
            from_instant=from_instant,
            to_instant=to_instant,
        )
        schedules = self._repository.find_schedules(
            from_date=date_from,
            to_date=date_to,
            from_instant=from_instant,
            to_instant=to_instant,
            offset=(page - 1) * page_size,
            limit=page_size,
        )
        return SchedulePage(schedules=schedules, total_items=total_items)

    def get_schedule(self, schedule_id: int) -> ScheduleView:
        return self._visible(schedule_id)

    def update_schedule(
        self,
        actor: AppUser,
        schedule_id: int,
        *,
        version: int,
        changes: Mapping[str, object],
    ) -> ScheduleView:
        schedule = self._repository.find_schedule_for_update(schedule_id)
        if schedule is None:
            raise ScheduleNotFoundError
        self._assert_can_write(actor, schedule)
        if schedule.version != version:
            raise ScheduleVersionConflictError(schedule.version)
        if not changes or set(changes) - _EDITABLE_FIELDS:
            raise InvalidScheduleError

        all_day = bool(changes.get("all_day", schedule.all_day))
        if all_day:
            if {"starts_at", "ends_at"} & set(changes):
                raise InvalidScheduleError
            start_date = self._pick_date(changes, "start_date", schedule, all_day)
            end_date_exclusive = self._pick_date(changes, "end_date_exclusive", schedule, all_day)
            starts_at = ends_at = None
        else:
            if {"start_date", "end_date_exclusive"} & set(changes):
                raise InvalidScheduleError
            starts_at = self._pick_instant(changes, "starts_at", schedule, all_day)
            ends_at = self._pick_instant(changes, "ends_at", schedule, all_day)
            start_date = end_date_exclusive = None

        title = changes.get("title", schedule.title)
        category = changes.get("category", schedule.category)
        description = changes.get("description", schedule.description)

        self._validate(all_day, start_date, end_date_exclusive, starts_at, ends_at)

        if (
            title == schedule.title
            and category == schedule.category
            and description == schedule.description
            and all_day == schedule.all_day
            and start_date == schedule.start_date
            and end_date_exclusive == schedule.end_date_exclusive
            and starts_at == schedule.starts_at
            and ends_at == schedule.ends_at
        ):
            raise InvalidScheduleError

        schedule.title = str(title)
        schedule.category = str(category)
        schedule.description = None if description is None else str(description)
        schedule.all_day = all_day
        schedule.start_date = start_date
        schedule.end_date_exclusive = end_date_exclusive
        schedule.starts_at = starts_at
        schedule.ends_at = ends_at
        schedule.version += 1
        self._session.commit()
        return self._visible(schedule.id)

    def delete_schedule(self, actor: AppUser, schedule_id: int, *, expected_version: int) -> None:
        schedule = self._repository.find_schedule_for_update(schedule_id)
        if schedule is None:
            raise ScheduleNotFoundError
        self._assert_can_write(actor, schedule)
        if schedule.version != expected_version:
            raise ScheduleVersionConflictError(schedule.version)
        schedule.deleted_at = self._clock()
        schedule.version += 1
        self._session.commit()

    def _visible(self, schedule_id: int) -> ScheduleView:
        view = self._repository.find_schedule(schedule_id)
        if view is None:
            raise ScheduleNotFoundError
        return view

    def _assert_can_write(self, actor: AppUser, schedule: Schedule) -> None:
        if actor.role != "admin" and schedule.author_id != actor.id:
            raise ScheduleForbiddenError

    @staticmethod
    def _pick_date(
        changes: Mapping[str, object], field: str, schedule: Schedule, all_day: bool
    ) -> date | None:
        if field in changes:
            return changes[field]  # type: ignore[return-value]
        return getattr(schedule, field) if all_day == schedule.all_day else None

    @staticmethod
    def _pick_instant(
        changes: Mapping[str, object], field: str, schedule: Schedule, all_day: bool
    ) -> datetime | None:
        if field in changes:
            return changes[field]  # type: ignore[return-value]
        return getattr(schedule, field) if all_day == schedule.all_day else None

    @staticmethod
    def _validate(
        all_day: bool,
        start_date: date | None,
        end_date_exclusive: date | None,
        starts_at: datetime | None,
        ends_at: datetime | None,
    ) -> None:
        if all_day:
            if start_date is None or end_date_exclusive is None:
                raise InvalidScheduleError
            if end_date_exclusive <= start_date:
                raise InvalidScheduleError
        else:
            if starts_at is None or ends_at is None:
                raise InvalidScheduleError
            if ends_at <= starts_at:
                raise InvalidScheduleError
