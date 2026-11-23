from datetime import UTC, date, datetime, time
from unittest.mock import MagicMock

from app.core.config import Settings
from app.dependencies.auth import get_current_user
from app.main import create_app
from app.models.master import AppUser
from app.models.schedule import Schedule
from app.repositories.schedule import ScheduleView
from app.routers.schedules import get_schedule_service
from app.services.schedule import (
    InvalidScheduleError,
    ScheduleForbiddenError,
    ScheduleNotFoundError,
    SchedulePage,
    ScheduleService,
    ScheduleVersionConflictError,
)
from fastapi import FastAPI
from fastapi.testclient import TestClient

NOW = datetime(2026, 11, 23, 8, 0, tzinfo=UTC)


def make_settings() -> Settings:
    return Settings(
        _env_file=None,
        database_url="postgresql+psycopg://user:password@localhost/database",
        jwt_secret="test-secret-that-is-at-least-32-characters",
    )


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


def make_view(*, all_day: bool = True, version: int = 1) -> ScheduleView:
    if all_day:
        schedule = Schedule(
            id=1,
            author_id=1,
            title="점검",
            category="inspection",
            description=None,
            all_day=True,
            start_date=date(2026, 11, 23),
            end_date_exclusive=date(2026, 11, 24),
            version=version,
            created_at=NOW,
            updated_at=NOW,
        )
    else:
        schedule = Schedule(
            id=1,
            author_id=1,
            title="회의",
            category="meeting",
            description=None,
            all_day=False,
            starts_at=NOW,
            ends_at=NOW.replace(hour=9),
            version=version,
            created_at=NOW,
            updated_at=NOW,
        )
    return ScheduleView(schedule=schedule, author_display_name="사용자")


def make_application(service: ScheduleService | None = None) -> FastAPI:
    application = create_app(
        settings=make_settings(),
        migration_checker=lambda engine, path: None,
    )
    application.dependency_overrides[get_current_user] = make_user
    if service is not None:
        application.dependency_overrides[get_schedule_service] = lambda: service
    return application


def with_csrf(client: TestClient) -> dict[str, str]:
    settings = make_settings()
    client.cookies.set(settings.csrf_cookie_name, "csrf-token")
    return {"X-CSRF-Token": "csrf-token"}


def test_schedules_require_authentication() -> None:
    application = create_app(settings=make_settings(), migration_checker=lambda engine, path: None)

    with TestClient(application) as client:
        response = client.get("/api/v1/schedules")

    assert response.status_code == 401
    assert response.json()["code"] == "AUTHENTICATION_REQUIRED"


def test_worker_creates_all_day_schedule() -> None:
    service = MagicMock(spec=ScheduleService)
    service.create_schedule.return_value = make_view()
    application = make_application(service)

    with TestClient(application) as client:
        headers = with_csrf(client)
        response = client.post(
            "/api/v1/schedules",
            json={
                "title": " 점검 ",
                "category": "inspection",
                "all_day": True,
                "start_date": "2026-11-23",
                "end_date_exclusive": "2026-11-24",
            },
            headers=headers,
        )

    assert response.status_code == 201
    body = response.json()
    assert body["schedule_id"] == 1
    assert body["all_day"] is True
    assert body["author_display_name"] == "사용자"
    actor, kwargs = service.create_schedule.call_args
    assert actor[0].id == 1
    assert kwargs["fields"]["title"] == "점검"
    assert kwargs["fields"]["start_date"] == date(2026, 11, 23)


def test_schedule_create_validates_shape() -> None:
    service = MagicMock(spec=ScheduleService)
    application = make_application(service)

    with TestClient(application) as client:
        headers = with_csrf(client)
        missing_dates = client.post(
            "/api/v1/schedules",
            json={"title": "점검", "category": "inspection", "all_day": True},
            headers=headers,
        )
        bad_range = client.post(
            "/api/v1/schedules",
            json={
                "title": "회의",
                "category": "meeting",
                "all_day": False,
                "starts_at": "2026-11-23T09:00:00+09:00",
                "ends_at": "2026-11-23T08:00:00+09:00",
            },
            headers=headers,
        )
        naive = client.post(
            "/api/v1/schedules",
            json={
                "title": "회의",
                "category": "meeting",
                "all_day": False,
                "starts_at": "2026-11-23T09:00:00",
                "ends_at": "2026-11-23T10:00:00",
            },
            headers=headers,
        )

    for response in (missing_dates, bad_range, naive):
        assert response.status_code == 422
        assert response.json()["code"] == "VALIDATION_ERROR"
    service.create_schedule.assert_not_called()


def test_list_schedules_returns_items_and_pagination() -> None:
    service = MagicMock(spec=ScheduleService)
    service.list_schedules.return_value = SchedulePage(schedules=[make_view()], total_items=1)
    application = make_application(service)

    with TestClient(application) as client:
        response = client.get(
            "/api/v1/schedules", params={"from": "2026-11-23", "to": "2026-11-23"}
        )

    assert response.status_code == 200
    assert response.json()["items"][0]["schedule_id"] == 1
    assert response.json()["pagination"]["total_items"] == 1
    service.list_schedules.assert_called_once_with(
        date_from=date(2026, 11, 23), date_to=date(2026, 11, 23), page=1, page_size=10
    )


def test_schedule_detail_returns_not_found() -> None:
    service = MagicMock(spec=ScheduleService)
    service.get_schedule.side_effect = ScheduleNotFoundError
    application = make_application(service)

    with TestClient(application) as client:
        response = client.get("/api/v1/schedules/1")

    assert response.status_code == 404
    assert response.json()["code"] == "SCHEDULE_NOT_FOUND"


def test_schedule_update_maps_domain_errors() -> None:
    application = make_application(MagicMock(spec=ScheduleService))

    with TestClient(application) as client:
        headers = with_csrf(client)
        cases = [
            (ScheduleForbiddenError(), 403, "FORBIDDEN"),
            (ScheduleVersionConflictError(3), 409, "VERSION_CONFLICT"),
            (InvalidScheduleError(), 422, "VALIDATION_ERROR"),
            (ScheduleNotFoundError(), 404, "SCHEDULE_NOT_FOUND"),
        ]
        for error, expected_status, expected_code in cases:
            service = MagicMock(spec=ScheduleService)
            service.update_schedule.side_effect = error
            application.dependency_overrides[get_schedule_service] = lambda s=service: s
            response = client.patch(
                "/api/v1/schedules/1", json={"version": 1, "title": "수정"}, headers=headers
            )
            assert response.status_code == expected_status
            assert response.json()["code"] == expected_code


def test_schedule_delete_requires_expected_version() -> None:
    service = MagicMock(spec=ScheduleService)
    application = make_application(service)

    with TestClient(application) as client:
        headers = with_csrf(client)
        missing = client.delete("/api/v1/schedules/1", headers=headers)
        deleted = client.delete("/api/v1/schedules/1?expected_version=1", headers=headers)

    assert missing.status_code == 422
    assert deleted.status_code == 204
    args, kwargs = service.delete_schedule.call_args
    assert args[0].id == 1
    assert args[1] == 1
    assert kwargs == {"expected_version": 1}
