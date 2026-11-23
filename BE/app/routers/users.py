from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Response, status

from app.dependencies.auth import (
    get_account_management_service,
    get_password_reset_service,
    require_admin,
    require_csrf_token,
)
from app.models.master import AppUser
from app.schemas.users import PasswordResetResponse, UserCreateRequest, UserCreateResponse
from app.services.account_management import (
    AccountManagementService,
    CreateUserCommand,
    EmployeeNumberAlreadyExistsError,
)
from app.services.password_reset import (
    PasswordResetService,
    SelfPasswordResetNotAllowedError,
    UserNotFoundError,
)

router = APIRouter(prefix="/users", tags=["users"])


@router.post(
    "",
    response_model=UserCreateResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf_token)],
)
def create_user(
    request: UserCreateRequest,
    _: Annotated[AppUser, Depends(require_admin)],
    service: Annotated[AccountManagementService, Depends(get_account_management_service)],
    response: Response,
) -> UserCreateResponse:
    try:
        result = service.create_user(
            CreateUserCommand(
                employee_no=request.employee_no,
                display_name=request.display_name,
                role=request.role,
                shift_start_local=request.shift_start_local,
                shift_end_local=request.shift_end_local,
            )
        )
    except EmployeeNumberAlreadyExistsError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "EMPLOYEE_NO_ALREADY_EXISTS",
                "message": "이미 사용 중인 사번입니다.",
            },
        ) from None

    response.headers["Cache-Control"] = "no-store"
    user = result.user
    return UserCreateResponse(
        user_id=user.id,
        employee_no=user.employee_no,
        display_name=user.display_name,
        role=user.role,
        shift_start_local=user.shift_start_local,
        shift_end_local=user.shift_end_local,
        temporary_password=result.temporary_password,
        must_change_password=user.must_change_password,
        version=user.version,
    )


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
