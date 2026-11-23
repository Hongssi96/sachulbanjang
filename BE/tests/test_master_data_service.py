from unittest.mock import MagicMock

from app.models.master import Department, Equipment, ProductionLine
from app.repositories.master_data import MasterDataRepository
from app.services.master_data import MasterDataService


def test_list_products_normalizes_blank_query() -> None:
    repository = MagicMock(spec=MasterDataRepository)
    repository.list_active_products.return_value = []

    MasterDataService(repository).list_products(query="   ")

    repository.list_active_products.assert_called_once_with(query=None)


def test_list_products_trims_query() -> None:
    repository = MagicMock(spec=MasterDataRepository)
    repository.list_active_products.return_value = []

    MasterDataService(repository).list_products(query="  제품  ")

    repository.list_active_products.assert_called_once_with(query="제품")


def test_list_equipment_passes_line_filter() -> None:
    repository = MagicMock(spec=MasterDataRepository)
    repository.list_active_equipment.return_value = []

    MasterDataService(repository).list_equipment(production_line_id=5)

    repository.list_active_equipment.assert_called_once_with(production_line_id=5)


def test_get_assignments_groups_active_targets() -> None:
    repository = MagicMock(spec=MasterDataRepository)
    department = Department(id=1, code="D1", name="생산1부")
    line = ProductionLine(id=2, department_id=1, code="L1", name="1라인")
    equipment = Equipment(id=3, equipment_code="S01", name="사출기", production_line_id=2)
    repository.list_assigned_departments.return_value = [department]
    repository.list_assigned_production_lines.return_value = [line]
    repository.list_assigned_equipment.return_value = [equipment]

    result = MasterDataService(repository).get_assignments(7)

    assert result.departments == [department]
    assert result.production_lines == [line]
    assert result.equipment == [equipment]
    repository.list_assigned_departments.assert_called_once_with(7)
    repository.list_assigned_production_lines.assert_called_once_with(7)
    repository.list_assigned_equipment.assert_called_once_with(7)
