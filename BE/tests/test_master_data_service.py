from unittest.mock import MagicMock

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
