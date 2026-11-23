from datetime import UTC, datetime
from math import ceil
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse

from app.core.config import Settings, get_settings
from app.dependencies.auth import (
    authentication_required,
    get_auth_service,
    get_current_user,
    require_csrf_token,
)
from app.errors import error_response
from app.models.master import AppUser
from app.schemas.auth import AuthenticatedUser, LoginRequest, PasswordChangeRequest
from app.security.cookies import (
    clear_auth_cookies,
    create_csrf_token,
    set_auth_cookies,
    set_csrf_cookie,
)
from app.services.auth import (
    AccountLockedError,
    AuthService,
    CurrentPasswordMismatchError,
    InvalidCredentialsError,
    InvalidRefreshTokenError,
    PasswordUnchangedError,
    RefreshInProgressError,
    SessionRevokedError,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _refresh_error_response(
    request: Request,
    settings: Settings,
    *,
    status_code: int,
    code: str,
    message: str,
    clear_cookies: bool = True,
    retry_after: str | None = None,
) -> JSONResponse:
    response = error_response(
        request,
        status_code=status_code,
        code=code,
        message=message,
    )
    if clear_cookies:
        clear_auth_cookies(response, settings)
    if retry_after is not None:
        response.headers["Retry-After"] = retry_after
    response.headers["Cache-Control"] = "no-store"
    return response


@router.post("/login", response_model=AuthenticatedUser)
def login(
    payload: LoginRequest,
    response: Response,
    service: Annotated[AuthService, Depends(get_auth_service)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AuthenticatedUser:
    try:
        result = service.login(payload.employee_no, payload.password)
    except AccountLockedError as exc:
        retry_after = max(1, ceil((exc.locked_until - datetime.now(UTC)).total_seconds()))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "ACCOUNT_LOCKED",
                "message": "로그인 시도가 제한되었습니다. 잠시 후 다시 시도해 주세요.",
            },
            headers={"Retry-After": str(retry_after)},
        ) from None
    except InvalidCredentialsError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "INVALID_CREDENTIALS",
                "message": "사번 또는 비밀번호가 올바르지 않습니다.",
            },
        ) from None

    set_auth_cookies(
        response,
        settings,
        access_token=result.access_token,
        refresh_token=result.refresh_token,
    )
    set_csrf_cookie(response, settings, create_csrf_token())
    response.headers["Cache-Control"] = "no-store"
    return AuthenticatedUser.model_validate(result.user)


@router.post(
    "/refresh",
    response_model=AuthenticatedUser,
    dependencies=[Depends(require_csrf_token)],
)
def refresh_tokens(
    request: Request,
    response: Response,
    service: Annotated[AuthService, Depends(get_auth_service)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AuthenticatedUser | JSONResponse:
    refresh_token = request.cookies.get(settings.refresh_cookie_name)
    if refresh_token is None:
        raise authentication_required()

    try:
        result = service.refresh(refresh_token)
    except InvalidRefreshTokenError:
        return _refresh_error_response(
            request,
            settings,
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="INVALID_REFRESH_TOKEN",
            message="로그인이 만료되었습니다. 다시 로그인해 주세요.",
        )
    except SessionRevokedError:
        return _refresh_error_response(
            request,
            settings,
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="SESSION_REVOKED",
            message="세션이 종료되었습니다. 다시 로그인해 주세요.",
        )
    except RefreshInProgressError:
        return _refresh_error_response(
            request,
            settings,
            status_code=status.HTTP_409_CONFLICT,
            code="REFRESH_IN_PROGRESS",
            message="같은 세션의 다른 갱신 요청이 처리 중입니다. 잠시 후 다시 시도해 주세요.",
            clear_cookies=False,
            retry_after="1",
        )

    set_auth_cookies(
        response,
        settings,
        access_token=result.access_token,
        refresh_token=result.refresh_token,
    )
    response.headers["Cache-Control"] = "no-store"
    return AuthenticatedUser.model_validate(result.user)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_csrf_token)],
)
def logout(
    request: Request,
    service: Annotated[AuthService, Depends(get_auth_service)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Response:
    service.logout(
        access_token=request.cookies.get(settings.access_cookie_name),
        refresh_token=request.cookies.get(settings.refresh_cookie_name),
    )
    cleared = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_auth_cookies(cleared, settings)
    cleared.headers["Cache-Control"] = "no-store"
    return cleared


@router.get("/me", response_model=AuthenticatedUser)
def read_current_user(
    user: Annotated[AppUser, Depends(get_current_user)],
) -> AuthenticatedUser:
    return AuthenticatedUser.model_validate(user)


@router.patch(
    "/password",
    response_model=AuthenticatedUser,
    dependencies=[Depends(require_csrf_token)],
)
def change_password(
    payload: PasswordChangeRequest,
    user: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[AuthService, Depends(get_auth_service)],
    response: Response,
) -> AuthenticatedUser:
    try:
        changed_user = service.change_password(
            user,
            current_password=payload.current_password,
            new_password=payload.new_password,
        )
    except CurrentPasswordMismatchError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "CURRENT_PASSWORD_MISMATCH",
                "message": "현재 비밀번호가 올바르지 않습니다.",
            },
        ) from None
    except PasswordUnchangedError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "PASSWORD_UNCHANGED",
                "message": "새 비밀번호는 현재 비밀번호와 달라야 합니다.",
            },
        ) from None

    response.headers["Cache-Control"] = "no-store"
    return AuthenticatedUser.model_validate(changed_user)
