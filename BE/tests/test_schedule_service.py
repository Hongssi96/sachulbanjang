from datetime import UTC, date, datetime, time
from unittest.mock import MagicMock

import pytest
from app.models.master import AppUser
from app.models.schedule import Schedule
from app.repositories.schedule import ScheduleRepository, ScheduleView
from app.services.schedule import (
    InvalidScheduleError,
    ScheduleForbiddenError,
    ScheduleNotFoundError,
    ScheduleService,
    ScheduleVersionConflictError,
)
from sqlalchemy.orm import Session

NOW = datetime(2026, 11, 23, 8, 0, tzinfo=UTC)


def make_user(user_id: int = 1, role: str = "worker") -> AppUser:
    return AppUser(
        id=user_id,
        employee_no=f"E{user_id:03d}",
        display_name="사용자",
        password_hash="unused",
        role=role,
        must_change_password=False,
        shift_start_local=time(9, 0),
        shift_end_local=time(18, 0),
        version=1,
    )


def make_schedule(
    schedule_id: int = 1,
    *,
    author_id: int = 1,
    all_day: bool = True,
    version: int = 1,
) -> Schedule:
    if all_day:
        return Schedule(
            id=schedule_id,
            author_id=author_id,
            title="점검",
            category="inspection",
            description=None,
            all_day=True,
            start_date=date(2026, 11, 23),
            end_date_exclusive=date(2026, 11, 24),
            version=version,
        )
    return Schedule(
        id=schedule_id,
        author_id=author_id,
        title="회의",
        category="meeting",
        description=None,
        all_day=False,
        starts_at=NOW,
        ends_at=NOW.replace(hour=9),
        version=version,
    )


def make_view(*, author_id: int = 1, all_day: bool = True, version: int = 1) -> ScheduleView:
    return ScheduleView(
        schedule=make_schedule(author_id=author_id, all_day=all_day, version=version),
        author_display_name="작성자",
    )


def build_service() -> tuple[ScheduleService, MagicMock, MagicMock]:
    session = MagicMock(spec=Session)
    repository = MagicMock(spec=ScheduleRepository)
    service = ScheduleService(session, repository, clock=lambda: NOW)
    return service, repository, session


def test_create_schedule_sets_author_and_commits() -> None:
    service, repository, session = build_service()
    repository.find_schedule.return_value = make_view()

    service.create_schedule(
        make_user(user_id=7),
        fields={
            "title": "점검",
            "category": "inspection",
            "description": None,
            "all_day": True,
            "start_date": date(2026, 11, 23),
            "end_date_exclusive": date(2026, 11, 24),
            "starts_at": None,
            "ends_at": None,
        },
    )

    schedule = repository.add_schedule.call_args.args[0]
    assert schedule.author_id == 7
    assert schedule.version == 1
    session.commit.assert_called_once_with()


def test_list_schedules_converts_period_and_paginates() -> None:
    service, repository, _ = build_service()
    repository.count_schedules.return_value = 1
    repository.find_schedules.return_value = [make_view()]

    service.list_schedules(
        date_from=date(2026, 11, 23), date_to=date(2026, 11, 23), page=2, page_size=10
    )

    expected = {
        "from_date": date(2026, 11, 23),
        "to_date": date(2026, 11, 23),
        "from_instant": datetime(2026, 11, 22, 15, 0, tzinfo=UTC),
        "to_instant": datetime(2026, 11, 23, 15, 0, tzinfo=UTC),
    }
    repository.count_schedules.assert_called_once_with(**expected)
    repository.find_schedules.assert_called_once_with(**expected, offset=10, limit=10)


def test_get_schedule_returns_not_found() -> None:
    service, repository, _ = build_service()
    repository.find_schedule.return_value = None

    with pytest.raises(ScheduleNotFoundError):
        service.get_schedule(1)


def test_update_all_day_schedule_by_author() -> None:
    service, repository, session = build_service()
    schedule = make_schedule()
    repository.find_schedule_for_update.return_value = schedule
    repository.find_schedule.return_value = make_view(version=2)

    service.update_schedule(make_user(), 1, version=1, changes={"title": "점검(수정)"})

    assert schedule.title == "점검(수정)"
    assert schedule.version == 2
    session.commit.assert_called_once_with()


def test_update_rejects_other_author_version_and_no_change() -> None:
    service, repository, _ = build_service()
    repository.find_schedule_for_update.return_value = make_schedule(author_id=2)

    with pytest.raises(ScheduleForbiddenError):
        service.update_schedule(make_user(user_id=1), 1, version=1, changes={"title": "x"})

    repository.find_schedule_for_update.return_value = make_schedule(version=4)
    with pytest.raises(ScheduleVersionConflictError):
        service.update_schedule(make_user(), 1, version=1, changes={"title": "x"})

    repository.find_schedule_for_update.return_value = make_schedule()
    with pytest.raises(InvalidScheduleError):
        service.update_schedule(make_user(), 1, version=1, changes={"title": "점검"})


def test_update_switches_time_representation() -> None:
    service, repository, _ = build_service()
    schedule = make_schedule(all_day=True)
    repository.find_schedule_for_update.return_value = schedule
    repository.find_schedule.return_value = make_view(all_day=False, version=2)

    service.update_schedule(
        make_user(),
        1,
        version=1,
        changes={"all_day": False, "starts_at": NOW, "ends_at": NOW.replace(hour=9)},
    )

    assert schedule.all_day is False
    assert schedule.start_date is None
    assert schedule.end_date_exclusive is None
    assert schedule.starts_at == NOW


def test_update_rejects_incomplete_switch_and_mixed_fields() -> None:
    service, repository, _ = build_service()
    repository.find_schedule_for_update.return_value = make_schedule(all_day=True)

    with pytest.raises(InvalidScheduleError):
        service.update_schedule(make_user(), 1, version=1, changes={"all_day": False})

    with pytest.raises(InvalidScheduleError):
        service.update_schedule(
            make_user(),
            1,
            version=1,
            changes={"start_date": date(2026, 11, 25), "starts_at": NOW},
        )


def test_delete_requires_author_or_admin_and_version() -> None:
    service, repository, session = build_service()
    schedule = make_schedule()
    repository.find_schedule_for_update.return_value = schedule

    service.delete_schedule(make_user(), 1, expected_version=1)
    assert schedule.deleted_at == NOW
    assert schedule.version == 2
    session.commit.assert_called_once_with()

    repository.find_schedule_for_update.return_value = make_schedule(author_id=2)
    with pytest.raises(ScheduleForbiddenError):
        service.delete_schedule(make_user(user_id=1), 1, expected_version=1)

    admin = make_user(user_id=9, role="admin")
    repository.find_schedule_for_update.return_value = make_schedule(author_id=2)
    service.delete_schedule(admin, 1, expected_version=1)
