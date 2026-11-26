from datetime import date
from math import ceil
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response, status
from sqlalchemy.orm import Session

from app.db.session import get_db_session
from app.dependencies.auth import get_current_user, require_admin, require_csrf_token
from app.models.master import AppUser
from app.repositories.inventory import InventoryRepository, MovementRow, StockRow
from app.schemas.inventory import (
    CorrectionRequest,
    MinimumStockRequest,
    MinimumStockResponse,
    MovementCreateRequest,
    MovementItem,
    MovementListResponse,
    MovementResult,
    Pagination,
    StockItem,
    StockListResponse,
)
from app.services.inventory import (
    InsufficientStockError,
    InvalidMovementError,
    InventoryError,
    InventoryService,
    MovementForbiddenError,
    MovementNotFoundError,
    ProductNotFoundError,
    StockAlreadyCheckedError,
)
from app.services.inventory import (
    MovementResult as MovementOutcome,
)

router = APIRouter(tags=["inventory"])


def get_inventory_service(
    session: Annotated[Session, Depends(get_db_session)],
) -> InventoryService:
    return InventoryService(session, InventoryRepository(session))


def _movement_result(result: MovementOutcome) -> MovementResult:
    movement = result.movement
    return MovementResult(
        movement_id=movement.id,
        product_id=movement.product_id,
        kind=movement.kind,
        delta=movement.delta,
        quantity_after=result.quantity_after,
        checked_at=movement.checked_at,
    )


def _stock_item(row: StockRow) -> StockItem:
    minimum = row.product.minimum_stock
    updated_at = row.balance_updated_at
    return StockItem(
        product_id=row.product.id,
        product_code=row.product.product_code,
        name=row.product.name,
        quantity=row.quantity,
        minimum_stock=minimum,
        is_low_stock=minimum is not None and row.quantity < minimum,
        balance_updated_at=(
            updated_at if updated_at is not None and updated_at.utcoffset() is not None else None
        ),
    )


def _movement_item(row: MovementRow) -> MovementItem:
    movement = row.movement
    return MovementItem(
        movement_id=movement.id,
        product_id=movement.product_id,
        product_code=row.product_code,
        product_name=row.product_name,
        kind=movement.kind,
        delta=movement.delta,
        reason=movement.reason,
        actor_id=movement.actor_id,
        actor_display_name=row.actor_display_name,
        original_movement_id=movement.original_movement_id,
        checked_by_id=movement.checked_by_id,
        checked_at=movement.checked_at,
        created_at=movement.created_at,
    )


def _handle_error(error: Exception) -> None:
    if isinstance(error, (ProductNotFoundError, MovementNotFoundError)):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "대상을 찾을 수 없습니다."},
        ) from None
    if isinstance(error, MovementForbiddenError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "FORBIDDEN",
                "message": "본인이 등록한 확인 전 거래만 정정할 수 있습니다.",
            },
        ) from None
    if isinstance(error, InsufficientStockError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "INSUFFICIENT_STOCK", "message": "재고가 부족합니다."},
        ) from None
    if isinstance(error, StockAlreadyCheckedError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "STOCK_ALREADY_CHECKED", "message": "이미 확인된 거래입니다."},
        ) from None
    if isinstance(error, InvalidMovementError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "VALIDATION_ERROR", "message": "허용되지 않는 재고 변경입니다."},
        ) from None
    raise error


@router.get("/stocks", response_model=StockListResponse)
def list_stocks(
    _: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[InventoryService, Depends(get_inventory_service)],
    q: Annotated[str | None, Query(max_length=100)] = None,
    low_stock: bool = False,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
) -> StockListResponse:
    result = service.list_stocks(query=q, low_stock_only=low_stock, page=page, page_size=page_size)
    return StockListResponse(
        items=[_stock_item(row) for row in result.rows],
        pagination=Pagination(
            page=page,
            page_size=page_size,
            total_items=result.total_items,
            total_pages=ceil(result.total_items / page_size) if result.total_items else 0,
        ),
    )


@router.get("/stock-movements", response_model=MovementListResponse)
def list_movements(
    _: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[InventoryService, Depends(get_inventory_service)],
    product_id: Annotated[int | None, Query(gt=0)] = None,
    kind: Annotated[
        Literal["initial", "receipt", "issue", "adjustment", "correction"] | None, Query()
    ] = None,
    date_from: Annotated[date | None, Query(alias="from")] = None,
    date_to: Annotated[date | None, Query(alias="to")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
) -> MovementListResponse:
    if date_from is not None and date_to is not None and date_from > date_to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "VALIDATION_ERROR",
                "message": "기간의 시작일은 종료일보다 늦을 수 없습니다.",
            },
        )
    result = service.list_movements(
        product_id=product_id,
        kind=kind,
        date_from=date_from,
        date_to=date_to,
        page=page,
        page_size=page_size,
    )
    return MovementListResponse(
        items=[_movement_item(row) for row in result.rows],
        pagination=Pagination(
            page=page,
            page_size=page_size,
            total_items=result.total_items,
            total_pages=ceil(result.total_items / page_size) if result.total_items else 0,
        ),
    )


@router.post(
    "/stock-movements",
    response_model=MovementResult,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf_token)],
)
def create_movement(
    request: MovementCreateRequest,
    actor: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[InventoryService, Depends(get_inventory_service)],
    response: Response,
) -> MovementResult:
    try:
        result = service.register_movement(
            actor,
            product_id=request.product_id,
            kind=request.kind,
            quantity=request.quantity,
            reason=request.reason,
        )
    except InventoryError as error:
        _handle_error(error)
        raise AssertionError("unreachable") from error
    response.headers["Cache-Control"] = "no-store"
    return _movement_result(result)


@router.post(
    "/stock-movements/{movement_id}/corrections",
    response_model=MovementResult,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf_token)],
)
def create_correction(
    movement_id: Annotated[int, Path(ge=1)],
    request: CorrectionRequest,
    actor: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[InventoryService, Depends(get_inventory_service)],
    response: Response,
) -> MovementResult:
    try:
        result = service.add_correction(
            actor, movement_id, delta=request.delta, reason=request.reason
        )
    except InventoryError as error:
        _handle_error(error)
        raise AssertionError("unreachable") from error
    response.headers["Cache-Control"] = "no-store"
    return _movement_result(result)


@router.post(
    "/stock-movements/{movement_id}/confirmation",
    response_model=MovementResult,
    dependencies=[Depends(require_csrf_token)],
)
def confirm_movement(
    movement_id: Annotated[int, Path(ge=1)],
    actor: Annotated[AppUser, Depends(require_admin)],
    service: Annotated[InventoryService, Depends(get_inventory_service)],
    response: Response,
) -> MovementResult:
    try:
        result = service.confirm_movement(actor, movement_id)
    except InventoryError as error:
        _handle_error(error)
        raise AssertionError("unreachable") from error
    response.headers["Cache-Control"] = "no-store"
    return _movement_result(result)


@router.patch(
    "/products/{product_id}/minimum-stock",
    response_model=MinimumStockResponse,
    dependencies=[Depends(require_csrf_token)],
)
def set_minimum_stock(
    product_id: Annotated[int, Path(ge=1)],
    request: MinimumStockRequest,
    actor: Annotated[AppUser, Depends(require_admin)],
    service: Annotated[InventoryService, Depends(get_inventory_service)],
    response: Response,
) -> MinimumStockResponse:
    try:
        product = service.set_minimum_stock(actor, product_id, request.minimum_stock)
    except InventoryError as error:
        _handle_error(error)
        raise AssertionError("unreachable") from error
    response.headers["Cache-Control"] = "no-store"
    return MinimumStockResponse(product_id=product.id, minimum_stock=product.minimum_stock)
