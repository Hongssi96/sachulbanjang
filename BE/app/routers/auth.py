from datetime import UTC, datetime
from math import ceil
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.core.config import Settings, get_settings
from app.dependencies.auth import get_auth_service, get_current_user
from app.models.master import AppUser
from app.schemas.auth import AuthenticatedUser, LoginRequest
from app.security.cookies import set_auth_cookies
from app.services.auth import AccountLockedError, AuthService, InvalidCredentialsError

router = APIRouter(prefix="/auth", tags=["auth"])


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
    response.headers["Cache-Control"] = "no-store"
    return AuthenticatedUser.model_validate(result.user)


@router.get("/me", response_model=AuthenticatedUser)
def read_current_user(
    user: Annotated[AppUser, Depends(get_current_user)],
) -> AuthenticatedUser:
    return AuthenticatedUser.model_validate(user)
