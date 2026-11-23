from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies.auth import (
    get_auth_service,
    get_current_session_id,
    get_current_user,
    require_csrf_token,
)
from app.models.auth import AuthSession
from app.models.master import AppUser
from app.schemas.auth import WorkSessionExtensionRequest, WorkSessionResponse
from app.services.auth import (
    AuthService,
    SessionRevokedError,
    WorkSessionConflictError,
    WorkSessionExtensionNotAllowedError,
)

router = APIRouter(prefix="/work-session", tags=["work-session"])


def _response(auth_session: AuthSession) -> WorkSessionResponse:
    return WorkSessionResponse(
        ends_at=auth_session.work_ends_at,
        warning_starts_at=auth_session.work_ends_at - timedelta(minutes=10),
        server_time=datetime.now(UTC),
        version=auth_session.work_session_version,
    )


@router.get("", response_model=WorkSessionResponse)
def read_work_session(
    _user: Annotated[AppUser, Depends(get_current_user)],
    session_id: Annotated[int, Depends(get_current_session_id)],
    service: Annotated[AuthService, Depends(get_auth_service)],
) -> WorkSessionResponse:
    try:
        return _response(service.get_work_session(session_id))
    except SessionRevokedError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "WORK_SESSION_ENDED", "message": "근무 이용 시간이 종료되었습니다."},
        ) from None


@router.post(
    "/extensions",
    response_model=WorkSessionResponse,
    dependencies=[Depends(require_csrf_token)],
)
def extend_work_session(
    payload: WorkSessionExtensionRequest,
    _user: Annotated[AppUser, Depends(get_current_user)],
    session_id: Annotated[int, Depends(get_current_session_id)],
    service: Annotated[AuthService, Depends(get_auth_service)],
) -> WorkSessionResponse:
    try:
        auth_session = service.extend_work_session(
            session_id,
            kind=payload.kind,
            expected_ends_at=payload.expected_ends_at,
            requested_ends_at=payload.ends_at,
        )
    except SessionRevokedError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "WORK_SESSION_ENDED", "message": "근무 이용 시간이 종료되었습니다."},
        ) from None
    except WorkSessionConflictError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "WORK_SESSION_CONFLICT",
                "message": "다른 화면에서 종료 시각이 먼저 변경되었습니다.",
            },
        ) from None
    except WorkSessionExtensionNotAllowedError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "WORK_SESSION_EXTENSION_NOT_ALLOWED",
                "message": "현재 종료 시각을 연장할 수 없습니다.",
            },
        ) from None
    return _response(auth_session)
