from dataclasses import dataclass
from datetime import date, datetime, timedelta

from sqlalchemy import ColumnElement, DateTime, and_, cast, func, or_, select
from sqlalchemy.orm import Session

from app.models.master import AppUser
from app.models.schedule import Schedule


@dataclass(frozen=True)
class ScheduleView:
    schedule: Schedule
    author_display_name: str


class ScheduleRepository:
    """Data access for schedule CRUD and calendar-range queries."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def _range_conditions(
        self,
        *,
        from_date: date | None,
        to_date: date | None,
        from_instant: datetime | None,
        to_instant: datetime | None,
    ) -> list[ColumnElement[bool]]:
        conditions: list[ColumnElement[bool]] = [Schedule.deleted_at.is_(None)]
        if from_date is not None and from_instant is not None:
            conditions.append(
                or_(
                    and_(Schedule.all_day.is_(True), Schedule.end_date_exclusive > from_date),
                    and_(Schedule.all_day.is_(False), Schedule.ends_at > from_instant),
                )
            )
        if to_date is not None and to_instant is not None:
            to_date_exclusive = to_date + timedelta(days=1)
            conditions.append(
                or_(
                    and_(Schedule.all_day.is_(True), Schedule.start_date < to_date_exclusive),
                    and_(Schedule.all_day.is_(False), Schedule.starts_at < to_instant),
                )
            )
        return conditions

    def count_schedules(
        self,
        *,
        from_date: date | None,
        to_date: date | None,
        from_instant: datetime | None,
        to_instant: datetime | None,
    ) -> int:
        conditions = self._range_conditions(
            from_date=from_date,
            to_date=to_date,
            from_instant=from_instant,
            to_instant=to_instant,
        )
        return (
            self._session.scalar(select(func.count()).select_from(Schedule).where(*conditions)) or 0
        )

    def find_schedules(
        self,
        *,
        from_date: date | None,
        to_date: date | None,
        from_instant: datetime | None,
        to_instant: datetime | None,
        offset: int,
        limit: int,
    ) -> list[ScheduleView]:
        conditions = self._range_conditions(
            from_date=from_date,
            to_date=to_date,
            from_instant=from_instant,
            to_instant=to_instant,
        )
        start_order = func.coalesce(
            Schedule.starts_at, cast(Schedule.start_date, DateTime(timezone=True))
        )
        rows = self._session.execute(
            select(Schedule, AppUser.display_name)
            .join(AppUser, AppUser.id == Schedule.author_id)
            .where(*conditions)
            .order_by(start_order.asc(), Schedule.id.asc())
            .offset(offset)
            .limit(limit)
        )
        return [
            ScheduleView(schedule=schedule, author_display_name=author_name)
            for schedule, author_name in rows
        ]

    def find_schedule(self, schedule_id: int) -> ScheduleView | None:
        row = self._session.execute(
            select(Schedule, AppUser.display_name)
            .join(AppUser, AppUser.id == Schedule.author_id)
            .where(Schedule.id == schedule_id, Schedule.deleted_at.is_(None))
        ).first()
        if row is None:
            return None
        schedule, author_name = row
        return ScheduleView(schedule=schedule, author_display_name=author_name)

    def find_schedule_for_update(self, schedule_id: int) -> Schedule | None:
        return self._session.scalar(
            select(Schedule)
            .where(Schedule.id == schedule_id, Schedule.deleted_at.is_(None))
            .with_for_update()
        )

    def add_schedule(self, schedule: Schedule) -> None:
        self._session.add(schedule)
        self._session.flush()
