from math import ceil
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response, status

from app.dependencies.auth import (
    get_account_management_service,
    get_password_reset_service,
    require_admin,
    require_csrf_token,
)
from app.models.master import AppUser
from app.schemas.users import (
    Pagination,
    PasswordResetResponse,
    UserCreateRequest,
    UserCreateResponse,
    UserListItem,
    UserListResponse,
)
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


def _user_list_item(user: AppUser) -> UserListItem:
    return UserListItem(
        user_id=user.id,
        employee_no=user.employee_no,
        display_name=user.display_name,
        role=user.role,
        is_active=user.deleted_at is None,
        shift_start_local=user.shift_start_local,
        shift_end_local=user.shift_end_local,
        version=user.version,
    )


@router.get("", response_model=UserListResponse)
def list_users(
    _: Annotated[AppUser, Depends(require_admin)],
    service: Annotated[AccountManagementService, Depends(get_account_management_service)],
    q: Annotated[str | None, Query(max_length=100)] = None,
    role: Annotated[Literal["admin", "worker"] | None, Query()] = None,
    include_inactive: bool = False,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
) -> UserListResponse:
    result = service.list_users(
        query=q,
        role=role,
        include_inactive=include_inactive,
        page=page,
        page_size=page_size,
    )
    return UserListResponse(
        items=[_user_list_item(user) for user in result.users],
        pagination=Pagination(
            page=page,
            page_size=page_size,
            total_items=result.total_items,
            total_pages=ceil(result.total_items / page_size) if result.total_items else 0,
        ),
    )


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
