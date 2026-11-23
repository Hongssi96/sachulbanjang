from datetime import date
from math import ceil
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response, status
from sqlalchemy.orm import Session

from app.db.session import get_db_session
from app.dependencies.auth import get_current_user, require_csrf_token
from app.models.master import AppUser
from app.repositories.schedule import ScheduleRepository, ScheduleView
from app.schemas.schedule import (
    Pagination,
    ScheduleCreateRequest,
    ScheduleItem,
    ScheduleListResponse,
    ScheduleUpdateRequest,
)
from app.services.schedule import (
    InvalidScheduleError,
    ScheduleError,
    ScheduleForbiddenError,
    ScheduleNotFoundError,
    ScheduleService,
    ScheduleVersionConflictError,
)

router = APIRouter(prefix="/schedules", tags=["schedules"])


def get_schedule_service(
    session: Annotated[Session, Depends(get_db_session)],
) -> ScheduleService:
    return ScheduleService(session, ScheduleRepository(session))


def _item(view: ScheduleView) -> ScheduleItem:
    schedule = view.schedule
    return ScheduleItem(
        schedule_id=schedule.id,
        title=schedule.title,
        category=schedule.category,
        description=schedule.description,
        all_day=schedule.all_day,
        start_date=schedule.start_date,
        end_date_exclusive=schedule.end_date_exclusive,
        starts_at=schedule.starts_at,
        ends_at=schedule.ends_at,
        author_id=schedule.author_id,
        author_display_name=view.author_display_name,
        version=schedule.version,
        created_at=schedule.created_at,
        updated_at=schedule.updated_at,
    )


def _handle_error(error: Exception) -> None:
    if isinstance(error, ScheduleNotFoundError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "SCHEDULE_NOT_FOUND", "message": "일정을 찾을 수 없습니다."},
        ) from None
    if isinstance(error, ScheduleForbiddenError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "FORBIDDEN",
                "message": "본인이 등록한 일정만 수정·삭제할 수 있습니다.",
            },
        ) from None
    if isinstance(error, ScheduleVersionConflictError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "VERSION_CONFLICT",
                "message": "다른 변경이 먼저 저장되었습니다. 최신 정보를 다시 조회해 주세요.",
            },
        ) from None
    if isinstance(error, InvalidScheduleError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "VALIDATION_ERROR",
                "message": "일정 형식이나 변경 내용이 올바르지 않습니다.",
            },
        ) from None
    raise error


@router.get("", response_model=ScheduleListResponse)
def list_schedules(
    _: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[ScheduleService, Depends(get_schedule_service)],
    date_from: Annotated[date | None, Query(alias="from")] = None,
    date_to: Annotated[date | None, Query(alias="to")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
) -> ScheduleListResponse:
    if date_from is not None and date_to is not None and date_from > date_to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "VALIDATION_ERROR",
                "message": "기간의 시작일은 종료일보다 늦을 수 없습니다.",
            },
        )
    result = service.list_schedules(
        date_from=date_from, date_to=date_to, page=page, page_size=page_size
    )
    return ScheduleListResponse(
        items=[_item(view) for view in result.schedules],
        pagination=Pagination(
            page=page,
            page_size=page_size,
            total_items=result.total_items,
            total_pages=ceil(result.total_items / page_size) if result.total_items else 0,
        ),
    )


@router.post(
    "",
    response_model=ScheduleItem,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf_token)],
)
def create_schedule(
    request: ScheduleCreateRequest,
    actor: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[ScheduleService, Depends(get_schedule_service)],
    response: Response,
) -> ScheduleItem:
    view = service.create_schedule(
        actor,
        fields={
            "title": request.title,
            "category": request.category,
            "description": request.description,
            "all_day": request.all_day,
            "start_date": request.start_date,
            "end_date_exclusive": request.end_date_exclusive,
            "starts_at": request.starts_at,
            "ends_at": request.ends_at,
        },
    )
    response.headers["Cache-Control"] = "no-store"
    return _item(view)


@router.get("/{schedule_id}", response_model=ScheduleItem)
def read_schedule(
    schedule_id: Annotated[int, Path(ge=1)],
    _: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[ScheduleService, Depends(get_schedule_service)],
) -> ScheduleItem:
    try:
        return _item(service.get_schedule(schedule_id))
    except ScheduleNotFoundError as error:
        _handle_error(error)
        raise AssertionError("unreachable") from error


@router.patch(
    "/{schedule_id}",
    response_model=ScheduleItem,
    dependencies=[Depends(require_csrf_token)],
)
def update_schedule(
    schedule_id: Annotated[int, Path(ge=1)],
    request: ScheduleUpdateRequest,
    actor: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[ScheduleService, Depends(get_schedule_service)],
    response: Response,
) -> ScheduleItem:
    try:
        view = service.update_schedule(
            actor,
            schedule_id,
            version=request.version,
            changes=request.changes(),
        )
    except ScheduleError as error:
        _handle_error(error)
        raise AssertionError("unreachable") from error
    response.headers["Cache-Control"] = "no-store"
    return _item(view)


@router.delete(
    "/{schedule_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_csrf_token)],
)
def delete_schedule(
    schedule_id: Annotated[int, Path(ge=1)],
    actor: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[ScheduleService, Depends(get_schedule_service)],
    expected_version: Annotated[int, Query(ge=1)],
) -> Response:
    try:
        service.delete_schedule(actor, schedule_id, expected_version=expected_version)
    except ScheduleError as error:
        _handle_error(error)
        raise AssertionError("unreachable") from error
    return Response(status_code=status.HTTP_204_NO_CONTENT)
