from datetime import datetime
from typing import Annotated, cast

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db_session
from app.dependencies.auth import get_current_user
from app.models.master import AppUser
from app.repositories.process_replay import ProcessReplayRepository
from app.schemas.process import CurrentProcessItem, CurrentProcessResponse
from app.services.process_replay import CurrentProcessResult, CurrentProcessService

router = APIRouter(prefix="/process", tags=["process"])


def get_current_process_service(
    session: Annotated[Session, Depends(get_db_session)],
) -> CurrentProcessService:
    return CurrentProcessService(ProcessReplayRepository(session))


def build_current_process_response(result: CurrentProcessResult) -> CurrentProcessResponse:
    replay = result.replay
    items = [
        CurrentProcessItem(
            equipment_id=current.equipment.id,
            equipment_code=current.equipment.equipment_code,
            equipment_name=current.equipment.name,
            product_id=current.product.id if current.product is not None else None,
            product_code=current.product.product_code if current.product is not None else None,
            product_name=current.product.name if current.product is not None else None,
            cycle_time_seconds=current.record.cycle_time_seconds,
            occurred_at=current.record.occurred_at,
            available_at=cast(datetime, current.record.available_at),
            is_demo=current.record.is_demo,
        )
        for current in result.records
    ]
    return CurrentProcessResponse(
        queried_at=result.queried_at,
        replay_id=replay.id if replay is not None else None,
        replay_state=result.replay_state,
        data_time=replay.data_time if replay is not None else None,
        last_advanced_at=replay.last_advanced_at if replay is not None else None,
        items=items,
    )


@router.get("/current", response_model=CurrentProcessResponse)
def read_current_process(
    _: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[CurrentProcessService, Depends(get_current_process_service)],
    equipment_id: Annotated[int | None, Query(gt=0)] = None,
) -> CurrentProcessResponse:
    return build_current_process_response(service.get_current(equipment_id=equipment_id))
