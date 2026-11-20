from collections.abc import Collection

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.master import Equipment, Product
from app.models.process import ProcessRecord, ProcessReplay, SourceImport


class ProcessImportRepository:
    """Data access used by the atomic CSV import service."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def find_import_by_fingerprint(self, fingerprint: str) -> SourceImport | None:
        return self._session.scalar(
            select(SourceImport).where(SourceImport.source_fingerprint == fingerprint)
        )

    def add_import(self, source_import: SourceImport) -> None:
        self._session.add(source_import)
        self._session.flush()

    def find_equipment(self, equipment_code: str) -> Equipment | None:
        return self._session.scalar(
            select(Equipment).where(Equipment.equipment_code == equipment_code)
        )

    def add_equipment(self, equipment: Equipment) -> None:
        self._session.add(equipment)
        self._session.flush()

    def find_product_by_code(self, product_code: str) -> Product | None:
        return self._session.scalar(select(Product).where(Product.product_code == product_code))

    def find_uncoded_products_by_name(self, name: str) -> list[Product]:
        return list(
            self._session.scalars(
                select(Product).where(Product.product_code.is_(None), Product.name == name)
            )
        )

    def add_product(self, product: Product) -> None:
        self._session.add(product)
        self._session.flush()

    def find_records_by_source_keys(
        self, namespace: str, source_keys: Collection[str]
    ) -> dict[str, ProcessRecord]:
        if not source_keys:
            return {}
        records = self._session.scalars(
            select(ProcessRecord).where(
                ProcessRecord.source_namespace == namespace,
                ProcessRecord.source_record_key.in_(source_keys),
            )
        )
        return {record.source_record_key: record for record in records}

    def add_records(self, records: Collection[ProcessRecord]) -> None:
        self._session.add_all(records)
        self._session.flush()

    def add_replay(self, replay: ProcessReplay) -> None:
        self._session.add(replay)
