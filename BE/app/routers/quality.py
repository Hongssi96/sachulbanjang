from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db_session
from app.dependencies.auth import get_current_user
from app.models.master import AppUser
from app.repositories.operation import OperationRepository
from app.repositories.quality import QualityRepository
from app.schemas.quality import (
    DefectTypeCount,
    OperationSummaryResponse,
    QualitySummaryResponse,
)
from app.services.operation import OperationService, seconds_to_hours
from app.services.quality import QualityService

router = APIRouter(prefix="/quality", tags=["quality"])


def get_quality_service(
    session: Annotated[Session, Depends(get_db_session)],
) -> QualityService:
    return QualityService(QualityRepository(session))


def get_operation_service(
    session: Annotated[Session, Depends(get_db_session)],
) -> OperationService:
    return OperationService(OperationRepository(session))


@router.get("/summary", response_model=QualitySummaryResponse)
def read_quality_summary(
    _: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[QualityService, Depends(get_quality_service)],
    equipment_id: Annotated[int | None, Query(gt=0)] = None,
    product_id: Annotated[int | None, Query(gt=0)] = None,
    date_from: Annotated[date | None, Query(alias="from")] = None,
    date_to: Annotated[date | None, Query(alias="to")] = None,
) -> QualitySummaryResponse:
    if date_from is not None and date_to is not None and date_from > date_to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "VALIDATION_ERROR",
                "message": "기간의 시작일은 종료일보다 늦을 수 없습니다.",
            },
        )
    summary = service.get_summary(
        equipment_id=equipment_id,
        product_id=product_id,
        date_from=date_from,
        date_to=date_to,
    )
    return QualitySummaryResponse(
        inspected_count=summary.inspected_count,
        good_count=summary.good_count,
        defect_count=summary.defect_count,
        defect_rate=summary.defect_rate,
        defect_types=[
            DefectTypeCount(type=defect_type, count=count)
            for defect_type, count in summary.defect_types
        ],
        production_record_count=summary.production_record_count,
        includes_demo=summary.includes_demo,
    )


@router.get("/operation", response_model=OperationSummaryResponse)
def read_quality_operation(
    _: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[OperationService, Depends(get_operation_service)],
    equipment_id: Annotated[int | None, Query(gt=0)] = None,
    date_from: Annotated[date | None, Query(alias="from")] = None,
    date_to: Annotated[date | None, Query(alias="to")] = None,
) -> OperationSummaryResponse:
    if date_from is not None and date_to is not None and date_from > date_to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "VALIDATION_ERROR",
                "message": "기간의 시작일은 종료일보다 늦을 수 없습니다.",
            },
        )
    summary = service.get_summary(
        equipment_id=equipment_id,
        date_from=date_from,
        date_to=date_to,
    )
    return OperationSummaryResponse(
        equipment_id=equipment_id,
        from_date=date_from,
        to_date=date_to,
        planned_hours=seconds_to_hours(summary.planned_seconds),
        actual_hours=seconds_to_hours(summary.actual_seconds),
        operation_rate=summary.rate,
        includes_demo=summary.includes_demo,
    )
