from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from app.repositories.operation import OperationRepository

_HUNDRED = Decimal(100)
_HOURS_PER_SECOND = Decimal(3600)
_RATE_QUANTUM = Decimal("0.01")
_HOURS_QUANTUM = Decimal("0.01")


@dataclass(frozen=True)
class OperationSummary:
    planned_seconds: int
    actual_seconds: int
    rate: Decimal | None
    includes_demo: bool


def seconds_to_hours(seconds: int) -> Decimal:
    return (Decimal(seconds) / _HOURS_PER_SECOND).quantize(_HOURS_QUANTUM, rounding=ROUND_HALF_UP)


class OperationService:
    """Aggregate planned and actual run time over the filtered range."""

    def __init__(self, repository: OperationRepository) -> None:
        self._repository = repository

    def get_summary(
        self,
        *,
        equipment_id: int | None,
        date_from: date | None,
        date_to: date | None,
    ) -> OperationSummary:
        totals = self._repository.totals(
            equipment_id=equipment_id, date_from=date_from, date_to=date_to
        )
        rate: Decimal | None = None
        if totals.planned_seconds > 0:
            rate = (
                Decimal(totals.actual_seconds) * _HUNDRED / Decimal(totals.planned_seconds)
            ).quantize(_RATE_QUANTUM, rounding=ROUND_HALF_UP)
        return OperationSummary(
            planned_seconds=totals.planned_seconds,
            actual_seconds=totals.actual_seconds,
            rate=rate,
            includes_demo=totals.includes_demo,
        )
