import logging
from collections.abc import Mapping
from typing import Any

from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

logger = logging.getLogger("app.error")

STATUS_CODES: dict[int, tuple[str, str]] = {
    status.HTTP_400_BAD_REQUEST: ("BAD_REQUEST", "요청을 처리할 수 없습니다."),
    status.HTTP_401_UNAUTHORIZED: ("AUTHENTICATION_REQUIRED", "로그인이 필요합니다."),
    status.HTTP_403_FORBIDDEN: ("FORBIDDEN", "요청한 작업을 수행할 권한이 없습니다."),
    status.HTTP_404_NOT_FOUND: ("NOT_FOUND", "요청한 대상을 찾을 수 없습니다."),
    status.HTTP_409_CONFLICT: ("CONFLICT", "다른 변경과 충돌했습니다."),
    status.HTTP_422_UNPROCESSABLE_CONTENT: ("VALIDATION_ERROR", "입력값을 확인해 주세요."),
}


def request_id_from(request: Request) -> str:
    return str(request.state.request_id)


def error_response(
    request: Request,
    *,
    status_code: int,
    code: str,
    message: str,
    details: list[dict[str, Any]] | None = None,
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    content: dict[str, Any] = {
        "code": code,
        "message": message,
        "request_id": request_id_from(request),
    }
    if details is not None:
        content["details"] = details
    response_headers = dict(headers or {})
    response_headers.setdefault("X-Request-ID", request_id_from(request))
    return JSONResponse(status_code=status_code, content=content, headers=response_headers)


async def http_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, HTTPException):
        raise exc
    fallback_code, fallback_message = STATUS_CODES.get(
        exc.status_code, ("HTTP_ERROR", "요청을 처리하지 못했습니다.")
    )
    detail = exc.detail
    code = fallback_code
    message = fallback_message
    if isinstance(detail, dict):
        code = str(detail.get("code", fallback_code))
        message = str(detail.get("message", fallback_message))
    elif isinstance(detail, str) and exc.status_code not in STATUS_CODES:
        message = detail
    return error_response(
        request,
        status_code=exc.status_code,
        code=code,
        message=message,
        headers=exc.headers,
    )


async def validation_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, RequestValidationError):
        raise exc
    details = [
        {
            "field": ".".join(str(part) for part in error["loc"] if part != "body"),
            "message": error["msg"],
            "type": error["type"],
        }
        for error in exc.errors()
    ]
    return error_response(
        request,
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        code="VALIDATION_ERROR",
        message="입력값을 확인해 주세요.",
        details=details,
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception(
        "unhandled request error",
        exc_info=exc,
        extra={"request_id": request_id_from(request)},
    )
    return error_response(
        request,
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        code="INTERNAL_SERVER_ERROR",
        message="서버에서 요청을 처리하지 못했습니다.",
    )
