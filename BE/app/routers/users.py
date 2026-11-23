from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Response, status

from app.dependencies.auth import (
    get_password_reset_service,
    require_admin,
    require_csrf_token,
)
from app.models.master import AppUser
from app.schemas.users import PasswordResetResponse
from app.services.password_reset import (
    PasswordResetService,
    SelfPasswordResetNotAllowedError,
    UserNotFoundError,
)

router = APIRouter(prefix="/users", tags=["users"])


@router.post(
    "/{user_id}/password-reset",
    response_model=PasswordResetResponse,
    dependencies=[Depends(require_csrf_token)],
)
def reset_user_password(
    user_id: Annotated[int, Path(ge=1)],
    actor: Annotated[AppUser, Depends(require_admin)],
    service: Annotated[PasswordResetService, Depends(get_password_reset_service)],
    response: Response,
) -> PasswordResetResponse:
    try:
        result = service.reset_password(actor, user_id)
    except UserNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "USER_NOT_FOUND", "message": "사용자를 찾을 수 없습니다."},
        ) from None
    except SelfPasswordResetNotAllowedError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "SELF_PASSWORD_RESET_NOT_ALLOWED",
                "message": "본인 계정의 비밀번호는 직접 변경해 주세요.",
            },
        ) from None

    response.headers["Cache-Control"] = "no-store"
    return PasswordResetResponse(
        user_id=result.user.id,
        employee_no=result.user.employee_no,
        temporary_password=result.temporary_password,
        must_change_password=result.user.must_change_password,
        version=result.user.version,
    )
