from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.db.session import get_db_session
from app.models.master import AppUser
from app.repositories.auth import AuthRepository
from app.security.tokens import TokenError, decode_access_token
from app.services.auth import AuthService


def authentication_required() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"code": "AUTHENTICATION_REQUIRED", "message": "로그인이 필요합니다."},
    )


def get_auth_service(
    session: Annotated[Session, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AuthService:
    return AuthService(session, AuthRepository(session), settings)


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

    user = AuthRepository(session).find_active_user_by_id(claims.user_id)
    if user is None:
        raise authentication_required()
    return user
