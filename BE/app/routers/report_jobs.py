from math import ceil
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response, status
from sqlalchemy.orm import Session

from app.db.session import get_db_session
from app.dependencies.auth import get_current_user, require_csrf_token
from app.models.master import AppUser
from app.models.report_job import GenerationJob
from app.repositories.report_job import ReportJobRepository
from app.schemas.report_job import (
    JobDetail,
    JobListItem,
    JobListResponse,
    JobRetryRequest,
    Pagination,
    ReportJobAcceptedResponse,
    ReportJobCreateRequest,
)
from app.services.report_job import (
    InvalidJobTransitionError,
    JobNotCancellableError,
    JobNotRetryableError,
    ReportJobNotFoundError,
    ReportJobService,
    RequestKeyConflictError,
)

router = APIRouter(tags=["report-jobs"])


def get_report_job_service(
    session: Annotated[Session, Depends(get_db_session)],
) -> ReportJobService:
    return ReportJobService(session, ReportJobRepository(session))


def _handle_error(error: Exception) -> None:
    if isinstance(error, ReportJobNotFoundError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "JOB_NOT_FOUND", "message": "작업을 찾을 수 없습니다."},
        ) from None
    if isinstance(error, RequestKeyConflictError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "REQUEST_KEY_CONFLICT",
                "message": "같은 요청 키로 다른 내용이 접수되었습니다.",
            },
        ) from None
    if isinstance(error, JobNotCancellableError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "JOB_NOT_CANCELLABLE",
                "message": "이미 종료된 작업은 취소할 수 없습니다.",
            },
        ) from None
    if isinstance(error, JobNotRetryableError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "JOB_NOT_RETRYABLE",
                "message": "실패·중단된 작업만 다시 시도할 수 있습니다.",
            },
        ) from None
    if isinstance(error, InvalidJobTransitionError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "INVALID_JOB_TRANSITION",
                "message": "현재 상태에서 허용되지 않는 전이입니다.",
            },
        ) from None
    raise error


def _list_item(job: GenerationJob, report_id: int | None) -> JobListItem:
    return JobListItem(
        job_id=job.id,
        kind=job.kind,
        state=job.state,
        client_request_key=job.client_request_key,
        accepted_at=job.accepted_at,
        data_cutoff_at=job.data_cutoff_at,
        finished_at=job.finished_at,
        error_code=job.error_code,
        safe_error_message=job.safe_error_message,
        retry_of_id=job.retry_of_id,
        attempt_count=job.attempt_count,
        report_id=report_id,
    )


def _detail(job: GenerationJob, report_id: int | None) -> JobDetail:
    return JobDetail(
        **_list_item(job, report_id).model_dump(),
        request_payload=job.request_payload,
        claimed_at=job.claimed_at,
        heartbeat_at=job.heartbeat_at,
        lease_expires_at=job.lease_expires_at,
    )


def _accepted(job: GenerationJob, report_id: int | None = None) -> ReportJobAcceptedResponse:
    return ReportJobAcceptedResponse(
        job_id=job.id,
        state=job.state,
        accepted_at=job.accepted_at,
        data_cutoff_at=job.data_cutoff_at,
        report_id=report_id,
    )


@router.post(
    "/report-jobs",
    response_model=ReportJobAcceptedResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_csrf_token)],
)
def submit_report_job(
    request: ReportJobCreateRequest,
    requester: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[ReportJobService, Depends(get_report_job_service)],
) -> ReportJobAcceptedResponse:
    try:
        job, _created = service.submit_report_job(
            requester,
            client_request_key=request.client_request_key,
            payload=request.payload(),
            force_regenerate=request.force_regenerate,
        )
    except RequestKeyConflictError as error:
        _handle_error(error)
        raise AssertionError("unreachable") from error
    _, report_id = service.get_job(requester, job.id)
    return _accepted(job, report_id)


@router.get("/jobs", response_model=JobListResponse)
def list_jobs(
    requester: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[ReportJobService, Depends(get_report_job_service)],
    kind: Annotated[Literal["report", "chat"] | None, Query()] = None,
    state: Annotated[
        Literal[
            "accepted",
            "querying",
            "writing",
            "succeeded",
            "failed",
            "interrupted",
            "cancelled",
        ]
        | None,
        Query(),
    ] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
) -> JobListResponse:
    result = service.list_jobs(requester, kind=kind, state=state, page=page, page_size=page_size)
    return JobListResponse(
        items=[_list_item(job, report_id) for job, report_id in result.jobs],
        pagination=Pagination(
            page=page,
            page_size=page_size,
            total_items=result.total_items,
            total_pages=ceil(result.total_items / page_size) if result.total_items else 0,
        ),
    )


@router.get("/jobs/{job_id}", response_model=JobDetail)
def read_job(
    job_id: Annotated[int, Path(ge=1)],
    requester: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[ReportJobService, Depends(get_report_job_service)],
) -> JobDetail:
    try:
        job, report_id = service.get_job(requester, job_id)
    except ReportJobNotFoundError as error:
        _handle_error(error)
        raise AssertionError("unreachable") from error
    return _detail(job, report_id)


@router.post(
    "/jobs/{job_id}/cancel",
    response_model=JobDetail,
    dependencies=[Depends(require_csrf_token)],
)
def cancel_job(
    job_id: Annotated[int, Path(ge=1)],
    requester: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[ReportJobService, Depends(get_report_job_service)],
    response: Response,
) -> JobDetail:
    try:
        job = service.cancel_job(requester, job_id)
        _, report_id = service.get_job(requester, job_id)
    except (ReportJobNotFoundError, JobNotCancellableError) as error:
        _handle_error(error)
        raise AssertionError("unreachable") from error
    response.headers["Cache-Control"] = "no-store"
    return _detail(job, report_id)


@router.post(
    "/jobs/{job_id}/retry",
    response_model=ReportJobAcceptedResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_csrf_token)],
)
def retry_job(
    job_id: Annotated[int, Path(ge=1)],
    request: JobRetryRequest,
    requester: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[ReportJobService, Depends(get_report_job_service)],
) -> ReportJobAcceptedResponse:
    try:
        job, _created = service.retry_job(
            requester, job_id, client_request_key=request.client_request_key
        )
    except (
        ReportJobNotFoundError,
        JobNotRetryableError,
        RequestKeyConflictError,
    ) as error:
        _handle_error(error)
        raise AssertionError("unreachable") from error
    return _accepted(job)
