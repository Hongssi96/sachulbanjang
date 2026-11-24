from datetime import date
from math import ceil
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response, status
from sqlalchemy.orm import Session

from app.core.datetime_labels import korean_kst_label
from app.db.session import get_db_session
from app.dependencies.auth import get_current_user, require_admin, require_csrf_token
from app.models.master import AppUser
from app.models.report import ReportRevision, ReportStatusEvent
from app.repositories.report import ReportRepository, ReportView
from app.schemas.report import (
    Pagination,
    ReportCategory,
    ReportCreateRequest,
    ReportDetail,
    ReportListItem,
    ReportListResponse,
    ReportRevisionItem,
    ReportRevisionListResponse,
    ReportStatus,
    ReportStatusChangeRequest,
    ReportStatusEventItem,
    ReportStatusEventListResponse,
    ReportUpdateRequest,
)
from app.services.report import (
    CreateReportCommand,
    InvalidReportStatusError,
    NoReportChangeError,
    ReportError,
    ReportLockedError,
    ReportNotFoundError,
    ReportService,
    ReportVersionConflictError,
)
from app.services.report_pdf import (
    ReportChartError,
    ReportPdfError,
    render_report_defect_chart,
    render_report_pdf,
    render_report_revision_pdf,
)

router = APIRouter(prefix="/reports", tags=["reports"])


def get_report_service(
    session: Annotated[Session, Depends(get_db_session)],
) -> ReportService:
    return ReportService(session, ReportRepository(session))


def _list_item(view: ReportView) -> ReportListItem:
    report = view.report
    return ReportListItem(
        report_id=report.id,
        title=report.title,
        category=report.category,
        report_kind=report.report_kind,
        business_status=report.business_status,
        author_id=report.author_id,
        author_display_name=view.author_display_name,
        version=report.version,
        created_at=report.created_at,
        updated_at=report.updated_at,
    )


def _detail(view: ReportView) -> ReportDetail:
    report = view.report
    return ReportDetail(
        **_list_item(view).model_dump(),
        body_markdown=report.body_markdown,
        last_editor_id=report.last_editor_id,
        last_editor_display_name=view.last_editor_display_name,
        generation_job_id=report.generation_job_id,
        generation_data_cutoff_at=report.generation_data_cutoff_at,
        generation_data_cutoff_label=(
            korean_kst_label(report.generation_data_cutoff_at)
            if report.generation_data_cutoff_at is not None
            else None
        ),
        generation_snapshot=report.generation_snapshot,
    )


def _revision_item(revision: ReportRevision, editor_name: str) -> ReportRevisionItem:
    return ReportRevisionItem(
        version=revision.version,
        title=revision.title,
        body_markdown=revision.body_markdown,
        editor_id=revision.editor_id,
        editor_display_name=editor_name,
        created_at=revision.created_at,
    )


def _status_event_item(event: ReportStatusEvent, actor_name: str) -> ReportStatusEventItem:
    return ReportStatusEventItem(
        event_id=event.id,
        before_status=event.before_status,
        after_status=event.after_status,
        actor_id=event.actor_id,
        actor_display_name=actor_name,
        created_at=event.created_at,
    )


def _handle_write_error(error: Exception) -> None:
    if isinstance(error, ReportNotFoundError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "REPORT_NOT_FOUND", "message": "보고서를 찾을 수 없습니다."},
        ) from None
    if isinstance(error, ReportVersionConflictError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "VERSION_CONFLICT",
                "message": "다른 변경이 먼저 저장되었습니다. 최신 정보를 다시 조회해 주세요.",
            },
        ) from None
    if isinstance(error, ReportLockedError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "REPORT_COMPLETED_LOCKED",
                "message": "완료된 보고서는 관리자만 수정·삭제할 수 있습니다.",
            },
        ) from None
    if isinstance(error, (InvalidReportStatusError, NoReportChangeError)):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "VALIDATION_ERROR",
                "message": "요청한 변경을 적용할 수 없습니다.",
            },
        ) from None
    raise error


@router.get("", response_model=ReportListResponse)
def list_reports(
    actor: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[ReportService, Depends(get_report_service)],
    q: Annotated[str | None, Query(max_length=100)] = None,
    category: Annotated[ReportCategory | None, Query()] = None,
    business_status: Annotated[ReportStatus | None, Query()] = None,
    date_from: Annotated[date | None, Query(alias="from")] = None,
    date_to: Annotated[date | None, Query(alias="to")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
) -> ReportListResponse:
    if date_from is not None and date_to is not None and date_from > date_to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "VALIDATION_ERROR",
                "message": "기간의 시작일은 종료일보다 늦을 수 없습니다.",
            },
        )
    result = service.list_reports(
        actor,
        query=q,
        category=category,
        business_status=business_status,
        date_from=date_from,
        date_to=date_to,
        page=page,
        page_size=page_size,
    )
    return ReportListResponse(
        items=[_list_item(view) for view in result.reports],
        pagination=Pagination(
            page=page,
            page_size=page_size,
            total_items=result.total_items,
            total_pages=ceil(result.total_items / page_size) if result.total_items else 0,
        ),
    )


@router.post(
    "",
    response_model=ReportDetail,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf_token)],
)
def create_report(
    request: ReportCreateRequest,
    actor: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[ReportService, Depends(get_report_service)],
    response: Response,
) -> ReportDetail:
    view = service.create_report(
        actor,
        CreateReportCommand(
            title=request.title,
            body_markdown=request.body_markdown,
            category=request.category,
            report_kind=request.report_kind,
        ),
    )
    response.headers["Cache-Control"] = "no-store"
    return _detail(view)


@router.get("/{report_id}", response_model=ReportDetail)
def read_report(
    report_id: Annotated[int, Path(ge=1)],
    actor: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[ReportService, Depends(get_report_service)],
) -> ReportDetail:
    try:
        return _detail(service.get_report(actor, report_id))
    except ReportNotFoundError as error:
        _handle_write_error(error)
        raise AssertionError("unreachable") from error


@router.get("/{report_id}/pdf")
def download_report_pdf(
    report_id: Annotated[int, Path(ge=1)],
    actor: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[ReportService, Depends(get_report_service)],
) -> Response:
    try:
        report = service.get_report(actor, report_id).report
        content = render_report_pdf(report)
        service.record_pdf_download(actor, report.id, report.version)
    except ReportNotFoundError as error:
        _handle_write_error(error)
        raise AssertionError("unreachable") from error
    except ReportPdfError as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "REPORT_PDF_FAILED", "message": str(error)},
        ) from None
    filename = f"report-{report_id}-v{report.version}.pdf"
    return Response(
        content=content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


@router.get("/{report_id}/charts/defect-types")
def read_report_defect_chart(
    report_id: Annotated[int, Path(ge=1)],
    actor: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[ReportService, Depends(get_report_service)],
) -> Response:
    try:
        report = service.get_report(actor, report_id).report
        content = render_report_defect_chart(report)
    except ReportNotFoundError as error:
        _handle_write_error(error)
        raise AssertionError("unreachable") from error
    except ReportChartError as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "REPORT_CHART_FAILED", "message": str(error)},
        ) from None
    if content is None:
        return Response(
            status_code=status.HTTP_204_NO_CONTENT, headers={"Cache-Control": "no-store"}
        )
    return Response(
        content=content,
        media_type="image/png",
        headers={"Cache-Control": "no-store"},
    )


@router.patch(
    "/{report_id}",
    response_model=ReportDetail,
    dependencies=[Depends(require_csrf_token)],
)
def update_report(
    report_id: Annotated[int, Path(ge=1)],
    request: ReportUpdateRequest,
    actor: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[ReportService, Depends(get_report_service)],
    response: Response,
) -> ReportDetail:
    try:
        view = service.update_report(
            actor,
            report_id,
            version=request.version,
            title=request.title,
            body_markdown=request.body_markdown,
        )
    except ReportError as error:
        _handle_write_error(error)
        raise AssertionError("unreachable") from error
    response.headers["Cache-Control"] = "no-store"
    return _detail(view)


@router.patch(
    "/{report_id}/status",
    response_model=ReportDetail,
    dependencies=[Depends(require_csrf_token)],
)
def change_report_status(
    report_id: Annotated[int, Path(ge=1)],
    request: ReportStatusChangeRequest,
    actor: Annotated[AppUser, Depends(require_admin)],
    service: Annotated[ReportService, Depends(get_report_service)],
    response: Response,
) -> ReportDetail:
    try:
        view = service.change_status(
            actor,
            report_id,
            version=request.version,
            business_status=request.business_status,
        )
    except ReportError as error:
        _handle_write_error(error)
        raise AssertionError("unreachable") from error
    response.headers["Cache-Control"] = "no-store"
    return _detail(view)


@router.delete(
    "/{report_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_csrf_token)],
)
def delete_report(
    report_id: Annotated[int, Path(ge=1)],
    actor: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[ReportService, Depends(get_report_service)],
    expected_version: Annotated[int, Query(ge=1)],
) -> Response:
    try:
        service.delete_report(actor, report_id, expected_version=expected_version)
    except ReportError as error:
        _handle_write_error(error)
        raise AssertionError("unreachable") from error
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{report_id}/revisions", response_model=ReportRevisionListResponse)
def list_report_revisions(
    report_id: Annotated[int, Path(ge=1)],
    actor: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[ReportService, Depends(get_report_service)],
) -> ReportRevisionListResponse:
    try:
        revisions = service.list_revisions(actor, report_id)
    except ReportNotFoundError as error:
        _handle_write_error(error)
        raise AssertionError("unreachable") from error
    return ReportRevisionListResponse(
        items=[_revision_item(revision, editor) for revision, editor in revisions]
    )


@router.get(
    "/{report_id}/revisions/{version}",
    response_model=ReportRevisionItem,
)
def read_report_revision(
    report_id: Annotated[int, Path(ge=1)],
    version: Annotated[int, Path(ge=1)],
    actor: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[ReportService, Depends(get_report_service)],
) -> ReportRevisionItem:
    try:
        revision, editor = service.get_revision(actor, report_id, version)
    except ReportNotFoundError as error:
        _handle_write_error(error)
        raise AssertionError("unreachable") from error
    return _revision_item(revision, editor)


@router.get("/{report_id}/revisions/{version}/pdf")
def download_report_revision_pdf(
    report_id: Annotated[int, Path(ge=1)],
    version: Annotated[int, Path(ge=1)],
    actor: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[ReportService, Depends(get_report_service)],
) -> Response:
    try:
        report = service.get_report(actor, report_id).report
        revision, _ = service.get_revision(actor, report_id, version)
        content = render_report_revision_pdf(report, revision)
        service.record_pdf_download(actor, report.id, revision.version)
    except ReportNotFoundError as error:
        _handle_write_error(error)
        raise AssertionError("unreachable") from error
    except ReportPdfError as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "REPORT_PDF_FAILED", "message": str(error)},
        ) from None
    filename = f"report-{report_id}-v{revision.version}.pdf"
    return Response(
        content=content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


@router.get("/{report_id}/status-events", response_model=ReportStatusEventListResponse)
def list_report_status_events(
    report_id: Annotated[int, Path(ge=1)],
    actor: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[ReportService, Depends(get_report_service)],
) -> ReportStatusEventListResponse:
    try:
        events = service.list_status_events(actor, report_id)
    except ReportNotFoundError as error:
        _handle_write_error(error)
        raise AssertionError("unreachable") from error
    return ReportStatusEventListResponse(
        items=[_status_event_item(event, actor_name) for event, actor_name in events]
    )
