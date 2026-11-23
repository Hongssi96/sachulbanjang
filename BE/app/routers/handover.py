from datetime import datetime
from math import ceil
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response, status
from sqlalchemy.orm import Session

from app.db.session import get_db_session
from app.dependencies.auth import get_current_user, require_csrf_token
from app.models.master import AppUser
from app.repositories.handover import (
    HandoverNoteRow,
    HandoverRepository,
    HandoverTargetRow,
)
from app.schemas.handover import (
    HandoverConfirmationItem,
    HandoverConfirmationResponse,
    HandoverCreateRequest,
    HandoverDetail,
    HandoverListItem,
    HandoverListResponse,
    HandoverTargetInput,
    HandoverTargetItem,
    HandoverTargetKind,
    HandoverUpdateRequest,
    Pagination,
)
from app.services.handover import (
    HandoverError,
    HandoverForbiddenError,
    HandoverNotFoundError,
    HandoverService,
    HandoverVersionConflictError,
    InvalidHandoverError,
)

router = APIRouter(prefix="/handover-notes", tags=["handover"])


def get_handover_service(
    session: Annotated[Session, Depends(get_db_session)],
) -> HandoverService:
    return HandoverService(session, HandoverRepository(session))


def _fetch_detail(service: HandoverService, actor: AppUser, note_id: int) -> HandoverDetail:
    row, targets, reads, my_confirmed_at = service.get_note(actor, note_id)
    return HandoverDetail(
        **_list_item(row, targets, len(reads), my_confirmed_at).model_dump(),
        confirmations=[
            HandoverConfirmationItem(
                user_id=read.read.user_id,
                display_name=read.display_name,
                confirmed_at=read.read.confirmed_at,
            )
            for read in reads
        ],
    )


def _target_kind(row: HandoverTargetRow) -> HandoverTargetKind:
    if row.target.department_id is not None:
        return "department"
    if row.target.production_line_id is not None:
        return "production_line"
    return "equipment"


def _target_id(row: HandoverTargetRow) -> int:
    target = row.target
    if target.department_id is not None:
        return target.department_id
    if target.production_line_id is not None:
        return target.production_line_id
    assert target.equipment_id is not None
    return target.equipment_id


def _target_item(row: HandoverTargetRow) -> HandoverTargetItem:
    return HandoverTargetItem(
        kind=_target_kind(row),
        target_id=_target_id(row),
        code=row.code,
        name=row.name,
    )


def _list_item(
    row: HandoverNoteRow,
    targets: list[HandoverTargetRow],
    confirmed_count: int,
    my_confirmed_at: datetime | None,
) -> HandoverListItem:
    note = row.note
    return HandoverListItem(
        note_id=note.id,
        author_id=note.author_id,
        author_display_name=row.author_display_name,
        body=note.body,
        version=note.version,
        created_at=note.created_at,
        updated_at=note.updated_at,
        targets=[_target_item(target) for target in targets],
        confirmed_count=confirmed_count,
        my_confirmed_at=my_confirmed_at,
    )


def _pairs(targets: list[HandoverTargetInput] | None) -> list[tuple[str, int]] | None:
    if targets is None:
        return None
    return [(target.kind, target.id) for target in targets]


def _handle_error(error: Exception) -> None:
    if isinstance(error, HandoverNotFoundError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "HANDOVER_NOT_FOUND", "message": "인수인계 노트를 찾을 수 없습니다."},
        ) from None
    if isinstance(error, HandoverForbiddenError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "FORBIDDEN",
                "message": "본인 노트만 수정할 수 있습니다.",
            },
        ) from None
    if isinstance(error, HandoverVersionConflictError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "VERSION_CONFLICT",
                "message": "다른 변경이 먼저 저장되었습니다. 최신 정보를 다시 조회해 주세요.",
            },
        ) from None
    if isinstance(error, InvalidHandoverError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "VALIDATION_ERROR",
                "message": "노트 내용이나 담당 대상이 올바르지 않습니다.",
            },
        ) from None
    raise error


@router.get("", response_model=HandoverListResponse)
def list_handover_notes(
    actor: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[HandoverService, Depends(get_handover_service)],
    q: Annotated[str | None, Query(max_length=200)] = None,
    department_id: Annotated[int | None, Query(gt=0)] = None,
    production_line_id: Annotated[int | None, Query(gt=0)] = None,
    equipment_id: Annotated[int | None, Query(gt=0)] = None,
    include_all: bool = False,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
) -> HandoverListResponse:
    provided = [
        kind
        for kind, value in (
            ("department", department_id),
            ("production_line", production_line_id),
            ("equipment", equipment_id),
        )
        if value is not None
    ]
    if len(provided) > 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "VALIDATION_ERROR",
                "message": "담당 대상 필터는 하나만 지정할 수 있습니다.",
            },
        )
    target_kind = provided[0] if provided else None
    target_id = department_id or production_line_id or equipment_id
    result = service.list_notes(
        actor,
        body_query=q,
        target_kind=target_kind,
        target_id=target_id,
        include_all=include_all,
        page=page,
        page_size=page_size,
    )
    items = [
        _list_item(
            row,
            result.targets.get(row.note.id, []),
            result.confirmed_counts.get(row.note.id, 0),
            result.my_reads.get(row.note.id),
        )
        for row in result.notes
    ]
    return HandoverListResponse(
        items=items,
        pagination=Pagination(
            page=page,
            page_size=page_size,
            total_items=result.total_items,
            total_pages=ceil(result.total_items / page_size) if result.total_items else 0,
        ),
    )


@router.post(
    "",
    response_model=HandoverDetail,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf_token)],
)
def create_handover_note(
    request: HandoverCreateRequest,
    actor: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[HandoverService, Depends(get_handover_service)],
    response: Response,
) -> HandoverDetail:
    try:
        note_id = service.create_note(actor, body=request.body, targets=_pairs(request.targets))
        detail = _fetch_detail(service, actor, note_id)
    except HandoverError as error:
        _handle_error(error)
        raise AssertionError("unreachable") from error
    response.headers["Cache-Control"] = "no-store"
    return detail


@router.get("/{note_id}", response_model=HandoverDetail)
def read_handover_note(
    note_id: Annotated[int, Path(ge=1)],
    actor: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[HandoverService, Depends(get_handover_service)],
) -> HandoverDetail:
    try:
        return _fetch_detail(service, actor, note_id)
    except HandoverError as error:
        _handle_error(error)
        raise AssertionError("unreachable") from error


@router.patch(
    "/{note_id}",
    response_model=HandoverDetail,
    dependencies=[Depends(require_csrf_token)],
)
def update_handover_note(
    note_id: Annotated[int, Path(ge=1)],
    request: HandoverUpdateRequest,
    actor: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[HandoverService, Depends(get_handover_service)],
    response: Response,
) -> HandoverDetail:
    try:
        service.update_note(
            actor,
            note_id,
            version=request.version,
            body=request.body,
            targets=_pairs(request.targets),
        )
        detail = _fetch_detail(service, actor, note_id)
    except HandoverError as error:
        _handle_error(error)
        raise AssertionError("unreachable") from error
    response.headers["Cache-Control"] = "no-store"
    return detail


@router.delete(
    "/{note_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_csrf_token)],
)
def delete_handover_note(
    note_id: Annotated[int, Path(ge=1)],
    actor: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[HandoverService, Depends(get_handover_service)],
    expected_version: Annotated[int, Query(ge=1)],
) -> Response:
    try:
        service.delete_note(actor, note_id, expected_version=expected_version)
    except HandoverError as error:
        _handle_error(error)
        raise AssertionError("unreachable") from error
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put(
    "/{note_id}/confirmation",
    response_model=HandoverConfirmationResponse,
    dependencies=[Depends(require_csrf_token)],
)
def confirm_handover_note(
    note_id: Annotated[int, Path(ge=1)],
    actor: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[HandoverService, Depends(get_handover_service)],
    response: Response,
) -> HandoverConfirmationResponse:
    try:
        read = service.confirm_note(actor, note_id)
    except HandoverError as error:
        _handle_error(error)
        raise AssertionError("unreachable") from error
    response.headers["Cache-Control"] = "no-store"
    return HandoverConfirmationResponse(
        note_id=read.handover_note_id,
        user_id=read.user_id,
        confirmed_at=read.confirmed_at,
    )
