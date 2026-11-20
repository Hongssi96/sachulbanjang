from fastapi import Response

from app.core.config import Settings

REFRESH_COOKIE_PATH = "/api/v1/auth"


def set_auth_cookies(
    response: Response,
    settings: Settings,
    *,
    access_token: str,
    refresh_token: str,
) -> None:
    response.set_cookie(
        settings.access_cookie_name,
        access_token,
        max_age=settings.access_token_ttl_seconds,
        path="/",
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite="lax",
    )
    response.set_cookie(
        settings.refresh_cookie_name,
        refresh_token,
        max_age=settings.refresh_token_ttl_seconds,
        path=REFRESH_COOKIE_PATH,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite="lax",
    )
