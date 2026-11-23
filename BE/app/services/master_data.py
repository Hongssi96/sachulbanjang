from app.models.master import Department, Equipment, Product, ProductionLine
from app.repositories.master_data import MasterDataRepository


class MasterDataService:
    """Provide active organization and product master data for selection screens."""

    def __init__(self, repository: MasterDataRepository) -> None:
        self._repository = repository

    def list_departments(self) -> list[Department]:
        return self._repository.list_active_departments()

    def list_production_lines(self, *, department_id: int | None) -> list[ProductionLine]:
        return self._repository.list_active_production_lines(department_id=department_id)

    def list_equipment(self, *, production_line_id: int | None) -> list[Equipment]:
        return self._repository.list_active_equipment(production_line_id=production_line_id)

    def list_products(self, *, query: str | None) -> list[Product]:
        normalized = query.strip() if query is not None else ""
        return self._repository.list_active_products(query=normalized or None)
