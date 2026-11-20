import secrets

from fastapi import Response

from app.core.config import Settings

REFRESH_COOKIE_PATH = "/api/v1/auth"
CSRF_HEADER_NAME = "X-CSRF-Token"


def create_csrf_token() -> str:
    return secrets.token_urlsafe(32)


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


def set_csrf_cookie(response: Response, settings: Settings, token: str) -> None:
    """Non-HttpOnly cookie read by the FE and echoed in the CSRF header."""
    response.set_cookie(
        settings.csrf_cookie_name,
        token,
        max_age=settings.refresh_token_ttl_seconds,
        path="/",
        httponly=False,
        secure=settings.auth_cookie_secure,
        samesite="lax",
    )


def clear_auth_cookies(response: Response, settings: Settings) -> None:
    response.delete_cookie(settings.access_cookie_name, path="/")
    response.delete_cookie(settings.refresh_cookie_name, path=REFRESH_COOKIE_PATH)
    response.delete_cookie(settings.csrf_cookie_name, path="/")
