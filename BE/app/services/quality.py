from dataclasses import dataclass
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal

from app.repositories.quality import QualityRepository
from app.services.record_history import period_bounds

_HUNDRED = Decimal(100)
_RATE_QUANTUM = Decimal("0.01")


@dataclass(frozen=True)
class QualitySummary:
    inspected_count: int
    good_count: int
    defect_count: int
    defect_rate: Decimal | None
    defect_types: list[tuple[str | None, int]]
    production_record_count: int
    includes_demo: bool


class QualityService:
    """Aggregate inspection verdicts over the whole filtered range."""

    def __init__(self, repository: QualityRepository) -> None:
        self._repository = repository

    def get_summary(
        self,
        *,
        equipment_id: int | None,
        product_id: int | None,
        date_from: date | None,
        date_to: date | None,
        data_cutoff_at: datetime | None = None,
    ) -> QualitySummary:
        period_from, period_to = period_bounds(date_from, date_to)
        totals = self._repository.inspection_totals(
            equipment_id=equipment_id,
            product_id=product_id,
            period_from=period_from,
            period_to=period_to,
            data_cutoff_at=data_cutoff_at,
        )
        denominator = totals.good_count + totals.defect_count
        defect_rate: Decimal | None = None
        if denominator > 0:
            defect_rate = (Decimal(totals.defect_count) * _HUNDRED / Decimal(denominator)).quantize(
                _RATE_QUANTUM, rounding=ROUND_HALF_UP
            )
        return QualitySummary(
            inspected_count=totals.inspected_count,
            good_count=totals.good_count,
            defect_count=totals.defect_count,
            defect_rate=defect_rate,
            defect_types=self._repository.defect_type_counts(
                equipment_id=equipment_id,
                product_id=product_id,
                period_from=period_from,
                period_to=period_to,
                data_cutoff_at=data_cutoff_at,
            ),
            production_record_count=self._repository.production_record_count(
                equipment_id=equipment_id,
                product_id=product_id,
                period_from=period_from,
                period_to=period_to,
                data_cutoff_at=data_cutoff_at,
            ),
            includes_demo=totals.includes_demo,
        )
