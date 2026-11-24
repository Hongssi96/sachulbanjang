from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock

from app.repositories.operation import OperationRepository, OperationTotals
from app.services.operation import OperationService, seconds_to_hours


def build_service() -> tuple[OperationService, MagicMock]:
    repository = MagicMock(spec=OperationRepository)
    return OperationService(repository), repository


def test_summary_computes_rate_from_aggregated_seconds() -> None:
    service, repository = build_service()
    repository.totals.return_value = OperationTotals(
        planned_seconds=57600,
        actual_seconds=50400,
        includes_demo=True,
    )

    summary = service.get_summary(
        equipment_id=20,
        date_from=date(2026, 11, 18),
        date_to=date(2026, 11, 24),
    )

    assert seconds_to_hours(summary.planned_seconds) == Decimal("16.00")
    assert seconds_to_hours(summary.actual_seconds) == Decimal("14.00")
    assert summary.rate == Decimal("87.50")
    assert summary.includes_demo is True
    repository.totals.assert_called_once_with(
        equipment_id=20,
        date_from=date(2026, 11, 18),
        date_to=date(2026, 11, 24),
    )


def test_summary_returns_null_rate_when_planned_time_is_zero() -> None:
    service, repository = build_service()
    repository.totals.return_value = OperationTotals(
        planned_seconds=0,
        actual_seconds=0,
        includes_demo=False,
    )

    summary = service.get_summary(equipment_id=None, date_from=None, date_to=None)

    assert summary.rate is None
    assert summary.includes_demo is False


def test_seconds_to_hours_rounds_half_up() -> None:
    assert seconds_to_hours(28800) == Decimal("8.00")
    assert seconds_to_hours(4500) == Decimal("1.25")
    assert seconds_to_hours(1) == Decimal("0.00")
