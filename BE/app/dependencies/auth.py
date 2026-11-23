from datetime import UTC, datetime
from secrets import compare_digest
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.db.session import get_db_session
from app.models.master import AppUser
from app.repositories.auth import AuthRepository
from app.security.cookies import CSRF_HEADER_NAME
from app.security.tokens import TokenError, decode_access_token
from app.services.auth import AuthService
from app.services.password_reset import PasswordResetService


def authentication_required() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"code": "AUTHENTICATION_REQUIRED", "message": "로그인이 필요합니다."},
    )


def require_csrf_token(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
) -> None:
    """Double-submit check for cookie-authenticated state changes."""
    cookie_token = request.cookies.get(settings.csrf_cookie_name)
    header_token = request.headers.get(CSRF_HEADER_NAME)
    if (
        cookie_token is None
        or header_token is None
        or not compare_digest(cookie_token, header_token)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "CSRF_VALIDATION_FAILED",
                "message": "요청 위조 방지 토큰이 올바르지 않습니다.",
            },
        )


def get_auth_service(
    session: Annotated[Session, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AuthService:
    return AuthService(session, AuthRepository(session), settings)


def get_password_reset_service(
    session: Annotated[Session, Depends(get_db_session)],
) -> PasswordResetService:
    return PasswordResetService(session, AuthRepository(session))


def get_current_user(
    request: Request,
    session: Annotated[Session, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AppUser:
    token = request.cookies.get(settings.access_cookie_name)
    if token is None:
        raise authentication_required()

    try:
        claims = decode_access_token(token, secret=settings.jwt_secret.get_secret_value())
    except TokenError:
        raise authentication_required() from None

    repository = AuthRepository(session)
    auth_session = repository.find_session(claims.session_id)
    now = datetime.now(UTC)
    if (
        auth_session is None
        or auth_session.user_id != claims.user_id
        or auth_session.revoked_at is not None
        or auth_session.absolute_expires_at <= now
        or auth_session.work_ends_at <= now
    ):
        raise authentication_required()

    user = repository.find_active_user_by_id(claims.user_id)
    if user is None:
        raise authentication_required()
    return user


def require_admin(
    user: Annotated[AppUser, Depends(get_current_user)],
) -> AppUser:
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "FORBIDDEN",
                "message": "요청한 작업을 수행할 권한이 없습니다.",
            },
        )
    return user


def get_current_session_id(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
) -> int:
    token = request.cookies.get(settings.access_cookie_name)
    if token is None:
        raise authentication_required()
    try:
        return decode_access_token(token, secret=settings.jwt_secret.get_secret_value()).session_id
    except TokenError:
        raise authentication_required() from None
