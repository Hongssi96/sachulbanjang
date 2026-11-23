from datetime import UTC, date, datetime
from decimal import Decimal
from unittest.mock import MagicMock

from app.repositories.quality import InspectionTotals, QualityRepository
from app.services.quality import QualityService

NOW = datetime(2026, 11, 23, 7, 0, tzinfo=UTC)


def build_service() -> tuple[QualityService, MagicMock]:
    repository = MagicMock(spec=QualityRepository)
    repository.defect_type_counts.return_value = []
    repository.production_record_count.return_value = 0
    return QualityService(repository), repository


def totals(good: int, defect: int, *, inspected: int | None = None) -> InspectionTotals:
    return InspectionTotals(
        inspected_count=inspected if inspected is not None else good + defect,
        good_count=good,
        defect_count=defect,
        includes_demo=True,
    )


def test_summary_computes_defect_rate_and_converts_period() -> None:
    service, repository = build_service()
    repository.inspection_totals.return_value = totals(2, 1)
    repository.defect_type_counts.return_value = [("scratch", 1), (None, 0)]
    repository.production_record_count.return_value = 9

    summary = service.get_summary(
        equipment_id=20,
        product_id=None,
        date_from=date(2026, 11, 23),
        date_to=None,
    )

    assert summary.inspected_count == 3
    assert summary.good_count == 2
    assert summary.defect_count == 1
    assert summary.defect_rate == Decimal("33.33")
    assert summary.defect_types == [("scratch", 1), (None, 0)]
    assert summary.production_record_count == 9
    assert summary.includes_demo is True
    repository.inspection_totals.assert_called_once_with(
        equipment_id=20,
        product_id=None,
        period_from=datetime(2026, 11, 22, 15, 0, tzinfo=UTC),
        period_to=None,
    )


def test_summary_rounds_half_up() -> None:
    service, repository = build_service()
    repository.inspection_totals.return_value = totals(1, 2)

    summary = service.get_summary(equipment_id=None, product_id=None, date_from=None, date_to=None)

    assert summary.defect_rate == Decimal("66.67")


def test_summary_returns_null_rate_when_no_verdicts() -> None:
    service, repository = build_service()
    repository.inspection_totals.return_value = totals(0, 0, inspected=5)

    summary = service.get_summary(equipment_id=None, product_id=None, date_from=None, date_to=None)

    assert summary.inspected_count == 5
    assert summary.defect_rate is None
