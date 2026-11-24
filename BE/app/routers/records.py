from datetime import date
from math import ceil
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response, status
from sqlalchemy.orm import Session

from app.db.session import get_db_session
from app.dependencies.auth import get_current_user, require_admin, require_csrf_token
from app.models.master import AppUser
from app.repositories.record_correction import RecordChangeView, RecordCorrectionRepository
from app.repositories.record_history import (
    InspectionRecordView,
    ProcessRecordView,
    RecordHistoryRepository,
)
from app.schemas.record_changes import (
    ChangeHistoryItem,
    ChangeHistoryResponse,
    InspectionRecordUpdateRequest,
    ProcessRecordUpdateRequest,
    RecordDeleteRequest,
)
from app.schemas.records import (
    InspectionRecordItem,
    InspectionRecordListResponse,
    Pagination,
    ProcessRecordDetail,
    ProcessRecordItem,
    ProcessRecordListResponse,
)
from app.services.record_correction import (
    NoRecordChangeError,
    RecordCorrectionService,
    RecordVersionConflictError,
)
from app.services.record_history import RecordHistoryService, RecordNotFoundError

router = APIRouter(tags=["records"])


def get_record_history_service(
    session: Annotated[Session, Depends(get_db_session)],
) -> RecordHistoryService:
    return RecordHistoryService(RecordHistoryRepository(session))


def get_record_correction_service(
    session: Annotated[Session, Depends(get_db_session)],
) -> RecordCorrectionService:
    return RecordCorrectionService(session, RecordCorrectionRepository(session))


def _change_history_item(view: RecordChangeView) -> ChangeHistoryItem:
    change = view.change
    return ChangeHistoryItem(
        change_id=change.id,
        operation=change.operation,
        actor_id=change.actor_id,
        actor_display_name=view.actor_display_name,
        before_value=change.before_value,
        after_value=change.after_value,
        reason=change.reason,
        version=change.version,
        occurred_at=change.occurred_at,
    )


def validate_period(date_from: date | None, date_to: date | None) -> None:
    if date_from is not None and date_to is not None and date_from > date_to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "VALIDATION_ERROR",
                "message": "기간의 시작일은 종료일보다 늦을 수 없습니다.",
            },
        )


def _process_item(view: ProcessRecordView) -> ProcessRecordItem:
    record = view.record
    return ProcessRecordItem(
        record_id=record.id,
        equipment_id=view.equipment.id,
        equipment_code=view.equipment.equipment_code,
        equipment_name=view.equipment.name,
        product_id=view.product.id if view.product is not None else None,
        product_code=view.product.product_code if view.product is not None else None,
        product_name=view.product.name if view.product is not None else None,
        occurred_at=record.occurred_at,
        available_at=record.available_at,
        cycle_time_seconds=record.cycle_time_seconds,
        is_demo=record.is_demo,
        version=record.version,
    )


def _process_detail(view: ProcessRecordView) -> ProcessRecordDetail:
    item = _process_item(view)
    return ProcessRecordDetail(
        **item.model_dump(),
        source_import_id=view.record.source_import_id,
        source_row_number=view.record.source_row_number,
    )


def _inspection_item(view: InspectionRecordView) -> InspectionRecordItem:
    record = view.record
    return InspectionRecordItem(
        record_id=record.id,
        equipment_id=view.equipment.id,
        equipment_code=view.equipment.equipment_code,
        equipment_name=view.equipment.name,
        product_id=view.product.id if view.product is not None else None,
        product_code=view.product.product_code if view.product is not None else None,
        product_name=view.product.name if view.product is not None else None,
        process_record_id=record.process_record_id,
        inspected_at=record.inspected_at,
        available_at=record.available_at,
        verdict=record.verdict,
        defect_type=record.defect_type,
        reason=record.reason,
        is_demo=record.is_demo,
        version=record.version,
    )


@router.patch(
    "/process-records/{record_id}",
    response_model=ProcessRecordDetail,
    dependencies=[Depends(require_csrf_token)],
)
def update_process_record(
    record_id: Annotated[int, Path(ge=1)],
    request: ProcessRecordUpdateRequest,
    actor: Annotated[AppUser, Depends(require_admin)],
    service: Annotated[RecordCorrectionService, Depends(get_record_correction_service)],
    response: Response,
) -> ProcessRecordDetail:
    try:
        view = service.update_process_record(
            actor,
            record_id,
            version=request.version,
            change_reason=request.change_reason,
            changes=request.editable_changes(),
        )
    except RecordNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "RECORD_NOT_FOUND", "message": "기록을 찾을 수 없습니다."},
        ) from None
    except RecordVersionConflictError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "VERSION_CONFLICT",
                "message": "다른 변경이 먼저 저장되었습니다. 최신 정보를 다시 조회해 주세요.",
            },
        ) from None
    except NoRecordChangeError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "VALIDATION_ERROR",
                "message": "변경된 값이 없습니다. 수정할 필드를 확인해 주세요.",
            },
        ) from None

    response.headers["Cache-Control"] = "no-store"
    return _process_detail(view)


@router.delete(
    "/process-records/{record_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_csrf_token)],
)
def delete_process_record(
    record_id: Annotated[int, Path(ge=1)],
    request: RecordDeleteRequest,
    actor: Annotated[AppUser, Depends(require_admin)],
    service: Annotated[RecordCorrectionService, Depends(get_record_correction_service)],
) -> None:
    try:
        service.delete_process_record(
            actor,
            record_id,
            version=request.version,
            change_reason=request.change_reason,
        )
    except RecordNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "RECORD_NOT_FOUND", "message": "기록을 찾을 수 없습니다."},
        ) from None
    except RecordVersionConflictError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "VERSION_CONFLICT",
                "message": "다른 변경이 먼저 저장되었습니다. 최신 정보를 다시 조회해 주세요.",
            },
        ) from None


@router.get("/process-records/{record_id}/changes", response_model=ChangeHistoryResponse)
def read_process_record_changes(
    record_id: Annotated[int, Path(ge=1)],
    _: Annotated[AppUser, Depends(require_admin)],
    service: Annotated[RecordCorrectionService, Depends(get_record_correction_service)],
) -> ChangeHistoryResponse:
    try:
        changes = service.list_process_changes(record_id)
    except RecordNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "RECORD_NOT_FOUND", "message": "기록을 찾을 수 없습니다."},
        ) from None
    return ChangeHistoryResponse(items=[_change_history_item(view) for view in changes])


@router.get("/inspection-records", response_model=InspectionRecordListResponse)
def list_inspection_records(
    _: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[RecordHistoryService, Depends(get_record_history_service)],
    equipment_id: Annotated[int | None, Query(gt=0)] = None,
    product_id: Annotated[int | None, Query(gt=0)] = None,
    verdict: Annotated[Literal["good", "defect"] | None, Query()] = None,
    date_from: Annotated[date | None, Query(alias="from")] = None,
    date_to: Annotated[date | None, Query(alias="to")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
) -> InspectionRecordListResponse:
    validate_period(date_from, date_to)
    result = service.list_inspection_records(
        equipment_id=equipment_id,
        product_id=product_id,
        verdict=verdict,
        date_from=date_from,
        date_to=date_to,
        page=page,
        page_size=page_size,
    )
    return InspectionRecordListResponse(
        items=[_inspection_item(view) for view in result.records],
        pagination=Pagination(
            page=page,
            page_size=page_size,
            total_items=result.total_items,
            total_pages=ceil(result.total_items / page_size) if result.total_items else 0,
        ),
    )


@router.get("/inspection-records/{record_id}", response_model=InspectionRecordItem)
def read_inspection_record(
    record_id: Annotated[int, Path(ge=1)],
    _: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[RecordHistoryService, Depends(get_record_history_service)],
) -> InspectionRecordItem:
    try:
        return _inspection_item(service.get_inspection_record(record_id))
    except RecordNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "RECORD_NOT_FOUND", "message": "기록을 찾을 수 없습니다."},
        ) from None


@router.patch(
    "/inspection-records/{record_id}",
    response_model=InspectionRecordItem,
    dependencies=[Depends(require_csrf_token)],
)
def update_inspection_record(
    record_id: Annotated[int, Path(ge=1)],
    request: InspectionRecordUpdateRequest,
    actor: Annotated[AppUser, Depends(require_admin)],
    service: Annotated[RecordCorrectionService, Depends(get_record_correction_service)],
    response: Response,
) -> InspectionRecordItem:
    try:
        view = service.update_inspection_record(
            actor,
            record_id,
            version=request.version,
            change_reason=request.change_reason,
            changes=request.editable_changes(),
        )
    except RecordNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "RECORD_NOT_FOUND", "message": "기록을 찾을 수 없습니다."},
        ) from None
    except RecordVersionConflictError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "VERSION_CONFLICT",
                "message": "다른 변경이 먼저 저장되었습니다. 최신 정보를 다시 조회해 주세요.",
            },
        ) from None
    except NoRecordChangeError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "VALIDATION_ERROR",
                "message": "변경된 값이 없습니다. 수정할 필드를 확인해 주세요.",
            },
        ) from None

    response.headers["Cache-Control"] = "no-store"
    return _inspection_item(view)


@router.delete(
    "/inspection-records/{record_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_csrf_token)],
)
def delete_inspection_record(
    record_id: Annotated[int, Path(ge=1)],
    request: RecordDeleteRequest,
    actor: Annotated[AppUser, Depends(require_admin)],
    service: Annotated[RecordCorrectionService, Depends(get_record_correction_service)],
) -> None:
    try:
        service.delete_inspection_record(
            actor,
            record_id,
            version=request.version,
            change_reason=request.change_reason,
        )
    except RecordNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "RECORD_NOT_FOUND", "message": "기록을 찾을 수 없습니다."},
        ) from None
    except RecordVersionConflictError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "VERSION_CONFLICT",
                "message": "다른 변경이 먼저 저장되었습니다. 최신 정보를 다시 조회해 주세요.",
            },
        ) from None


@router.get("/inspection-records/{record_id}/changes", response_model=ChangeHistoryResponse)
def read_inspection_record_changes(
    record_id: Annotated[int, Path(ge=1)],
    _: Annotated[AppUser, Depends(require_admin)],
    service: Annotated[RecordCorrectionService, Depends(get_record_correction_service)],
) -> ChangeHistoryResponse:
    try:
        changes = service.list_inspection_changes(record_id)
    except RecordNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "RECORD_NOT_FOUND", "message": "기록을 찾을 수 없습니다."},
        ) from None
    return ChangeHistoryResponse(items=[_change_history_item(view) for view in changes])


@router.get("/process-records", response_model=ProcessRecordListResponse)
def list_process_records(
    _: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[RecordHistoryService, Depends(get_record_history_service)],
    equipment_id: Annotated[int | None, Query(gt=0)] = None,
    product_id: Annotated[int | None, Query(gt=0)] = None,
    date_from: Annotated[date | None, Query(alias="from")] = None,
    date_to: Annotated[date | None, Query(alias="to")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
) -> ProcessRecordListResponse:
    validate_period(date_from, date_to)
    result = service.list_process_records(
        equipment_id=equipment_id,
        product_id=product_id,
        date_from=date_from,
        date_to=date_to,
        page=page,
        page_size=page_size,
    )
    return ProcessRecordListResponse(
        items=[_process_item(view) for view in result.records],
        pagination=Pagination(
            page=page,
            page_size=page_size,
            total_items=result.total_items,
            total_pages=ceil(result.total_items / page_size) if result.total_items else 0,
        ),
    )


@router.get("/process-records/{record_id}", response_model=ProcessRecordDetail)
def read_process_record(
    record_id: Annotated[int, Path(ge=1)],
    _: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[RecordHistoryService, Depends(get_record_history_service)],
) -> ProcessRecordDetail:
    try:
        return _process_detail(service.get_process_record(record_id))
    except RecordNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "RECORD_NOT_FOUND", "message": "기록을 찾을 수 없습니다."},
        ) from None
