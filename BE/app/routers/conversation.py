from datetime import date
from math import ceil
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response, status
from sqlalchemy.orm import Session

from app.db.session import get_db_session
from app.dependencies.auth import get_current_user, require_csrf_token
from app.models.conversation import AnswerEvidence, ChatTurn
from app.models.master import AppUser
from app.models.report_job import GenerationJob
from app.repositories.conversation import (
    ConversationRepository,
    ConversationSummary,
)
from app.repositories.report_job import ReportJobRepository
from app.schemas.conversation import (
    AnswerEvidenceItem,
    ChatTurnAcceptedResponse,
    ChatTurnCreateRequest,
    ChatTurnItem,
    ChatTurnJob,
    ChatTurnRefreshRequest,
    ChatTurnRetryRequest,
    ConversationCreateRequest,
    ConversationDetail,
    ConversationListItem,
    ConversationListResponse,
)
from app.schemas.report_job import Pagination
from app.services.conversation import (
    ChatTurnInProgressError,
    ChatTurnNotFoundError,
    ChatTurnNotRetryableError,
    ConversationNotFoundError,
    ConversationService,
    ConversationView,
    TurnView,
)
from app.services.report_job import ReportJobService, RequestKeyConflictError

router = APIRouter(prefix="/conversations", tags=["conversations"])


def get_conversation_service(
    session: Annotated[Session, Depends(get_db_session)],
) -> ConversationService:
    return ConversationService(
        session,
        ConversationRepository(session),
        ReportJobService(session, ReportJobRepository(session)),
    )


def _handle_error(error: Exception) -> None:
    if isinstance(error, ConversationNotFoundError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CONVERSATION_NOT_FOUND", "message": "대화를 찾을 수 없습니다."},
        ) from None
    if isinstance(error, ChatTurnNotFoundError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CHAT_TURN_NOT_FOUND", "message": "대화 질문을 찾을 수 없습니다."},
        ) from None
    if isinstance(error, ChatTurnInProgressError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "CHAT_TURN_IN_PROGRESS",
                "message": "이전 질문의 답변을 생성 중입니다. 완료·실패·취소 후 전송해 주세요.",
            },
        ) from None
    if isinstance(error, ChatTurnNotRetryableError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "CHAT_TURN_NOT_RETRYABLE",
                "message": "실패·중단된 질문만 다시 시도할 수 있습니다.",
            },
        ) from None
    if isinstance(error, RequestKeyConflictError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "REQUEST_KEY_CONFLICT",
                "message": "같은 요청 키로 다른 내용이 접수되었습니다.",
            },
        ) from None
    raise error


def _list_item(summary: ConversationSummary) -> ConversationListItem:
    conversation = summary.conversation
    return ConversationListItem(
        conversation_id=conversation.id,
        title=conversation.title,
        turn_count=summary.turn_count,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
    )


def _job(job: GenerationJob | None) -> ChatTurnJob | None:
    if job is None:
        return None
    return ChatTurnJob(
        job_id=job.id,
        state=job.state,
        accepted_at=job.accepted_at,
        data_cutoff_at=job.data_cutoff_at,
        finished_at=job.finished_at,
        error_code=job.error_code,
        safe_error_message=job.safe_error_message,
    )


def _evidence(evidence: AnswerEvidence) -> AnswerEvidenceItem:
    return AnswerEvidenceItem(
        report_id=evidence.report_id,
        process_record_id=evidence.process_record_id,
        inspection_record_id=evidence.inspection_record_id,
        product_id=evidence.product_id,
        source_version=evidence.source_version,
        source_time=evidence.source_time,
    )


def _turn(view: TurnView) -> ChatTurnItem:
    turn = view.turn
    return ChatTurnItem(
        turn_id=turn.id,
        question=turn.question,
        answer=view.answer,
        answer_status=view.answer_status,
        answered_at=turn.answered_at,
        created_at=turn.created_at,
        data_cutoff_at=turn.data_cutoff_at,
        is_demo=turn.is_demo,
        job=_job(view.job),
        evidence=[_evidence(item) for item in view.evidence],
    )


def _detail(view: ConversationView) -> ConversationDetail:
    return ConversationDetail(
        **_list_item(
            ConversationSummary(
                conversation=view.conversation,
                turn_count=len(view.turns),
            )
        ).model_dump(),
        turns=[_turn(item) for item in view.turns],
    )


def _accepted(conversation_id: int, turn: ChatTurn, job: GenerationJob) -> ChatTurnAcceptedResponse:
    return ChatTurnAcceptedResponse(
        conversation_id=conversation_id,
        turn_id=turn.id,
        job_id=job.id,
        state=job.state,
        accepted_at=job.accepted_at,
        data_cutoff_at=job.data_cutoff_at,
    )


@router.post(
    "",
    response_model=ConversationDetail,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf_token)],
)
def create_conversation(
    request: ConversationCreateRequest,
    owner: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[ConversationService, Depends(get_conversation_service)],
    response: Response,
) -> ConversationDetail:
    conversation = service.create_conversation(owner, title=request.title)
    response.headers["Cache-Control"] = "no-store"
    return _detail(ConversationView(conversation=conversation, turns=[]))


@router.get("", response_model=ConversationListResponse)
def list_conversations(
    owner: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[ConversationService, Depends(get_conversation_service)],
    q: Annotated[str | None, Query(max_length=100)] = None,
    date_from: Annotated[date | None, Query(alias="from")] = None,
    date_to: Annotated[date | None, Query(alias="to")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
) -> ConversationListResponse:
    if date_from is not None and date_to is not None and date_from > date_to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "VALIDATION_ERROR",
                "message": "기간의 시작일은 종료일보다 늦을 수 없습니다.",
            },
        )
    result = service.list_conversations(
        owner,
        query=q,
        date_from=date_from,
        date_to=date_to,
        page=page,
        page_size=page_size,
    )
    return ConversationListResponse(
        items=[_list_item(item) for item in result.conversations],
        pagination=Pagination(
            page=page,
            page_size=page_size,
            total_items=result.total_items,
            total_pages=ceil(result.total_items / page_size) if result.total_items else 0,
        ),
    )


@router.get("/{conversation_id}", response_model=ConversationDetail)
def read_conversation(
    conversation_id: Annotated[int, Path(ge=1)],
    owner: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[ConversationService, Depends(get_conversation_service)],
    response: Response,
) -> ConversationDetail:
    try:
        view = service.get_conversation(owner, conversation_id)
    except ConversationNotFoundError as error:
        _handle_error(error)
        raise AssertionError("unreachable") from error
    response.headers["Cache-Control"] = "no-store"
    return _detail(view)


@router.delete(
    "/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_csrf_token)],
)
def delete_conversation(
    conversation_id: Annotated[int, Path(ge=1)],
    owner: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[ConversationService, Depends(get_conversation_service)],
) -> None:
    try:
        service.delete_conversation(owner, conversation_id)
    except ConversationNotFoundError as error:
        _handle_error(error)
        raise AssertionError("unreachable") from error


@router.post(
    "/{conversation_id}/turns",
    response_model=ChatTurnAcceptedResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_csrf_token)],
)
def create_turn(
    conversation_id: Annotated[int, Path(ge=1)],
    request: ChatTurnCreateRequest,
    owner: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[ConversationService, Depends(get_conversation_service)],
) -> ChatTurnAcceptedResponse:
    try:
        turn, job = service.submit_turn(
            owner,
            conversation_id,
            question=request.question,
            client_request_key=request.client_request_key,
        )
    except (
        ConversationNotFoundError,
        ChatTurnInProgressError,
        RequestKeyConflictError,
    ) as error:
        _handle_error(error)
        raise AssertionError("unreachable") from error
    return _accepted(conversation_id, turn, job)


@router.post(
    "/{conversation_id}/turns/{turn_id}/refresh",
    response_model=ChatTurnAcceptedResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_csrf_token)],
)
def refresh_turn(
    conversation_id: Annotated[int, Path(ge=1)],
    turn_id: Annotated[int, Path(ge=1)],
    request: ChatTurnRefreshRequest,
    owner: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[ConversationService, Depends(get_conversation_service)],
) -> ChatTurnAcceptedResponse:
    try:
        turn, job = service.refresh_turn(
            owner,
            conversation_id,
            turn_id,
            client_request_key=request.client_request_key,
        )
    except (
        ConversationNotFoundError,
        ChatTurnNotFoundError,
        ChatTurnInProgressError,
        RequestKeyConflictError,
    ) as error:
        _handle_error(error)
        raise AssertionError("unreachable") from error
    return _accepted(conversation_id, turn, job)


@router.post(
    "/{conversation_id}/turns/{turn_id}/retry",
    response_model=ChatTurnAcceptedResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_csrf_token)],
)
def retry_turn(
    conversation_id: Annotated[int, Path(ge=1)],
    turn_id: Annotated[int, Path(ge=1)],
    request: ChatTurnRetryRequest,
    owner: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[ConversationService, Depends(get_conversation_service)],
) -> ChatTurnAcceptedResponse:
    try:
        turn, job = service.retry_turn(
            owner,
            conversation_id,
            turn_id,
            client_request_key=request.client_request_key,
        )
    except (
        ConversationNotFoundError,
        ChatTurnNotFoundError,
        ChatTurnInProgressError,
        ChatTurnNotRetryableError,
        RequestKeyConflictError,
    ) as error:
        _handle_error(error)
        raise AssertionError("unreachable") from error
    return _accepted(conversation_id, turn, job)
