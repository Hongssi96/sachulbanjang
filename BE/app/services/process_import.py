from __future__ import annotations

import csv
import hashlib
from collections.abc import Callable, Iterator, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy.orm import Session

from app.models.master import Equipment, Product
from app.models.process import ProcessRecord, ProcessReplay, SourceImport
from app.repositories.process_import import ProcessImportRepository

REQUIRED_HEADERS = {"_id", "TimeStamp", "PART_NAME", "EQUIP_CD", "EQUIP_NAME", "Cycle_Time"}


class ProcessImportError(ValueError):
    """Base exception for a rejected process CSV import."""


class DuplicateSourceImportError(ProcessImportError):
    """Raised when the exact same source file was already imported."""


class SourceRecordConflictError(ProcessImportError):
    """Raised when a source key already exists with different content."""


class MasterDataConflictError(ProcessImportError):
    """Raised when a business code is reused with a conflicting name."""


@dataclass(frozen=True)
class ParsedProcessRow:
    row_number: int
    source_record_key: str
    occurred_at: datetime
    equipment_code: str
    equipment_name: str
    product_code: str | None
    product_name: str
    cycle_time_seconds: Decimal | None
    source_payload: dict[str, Any]


@dataclass(frozen=True)
class ProcessImportResult:
    import_id: int
    imported_records: int
    skipped_records: int
    created_equipment: int
    created_products: int


def calculate_sha256(path: Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(chunk_size):
            digest.update(chunk)
    return digest.hexdigest()


def _required_text(row: dict[str, str | None], field: str, row_number: int) -> str:
    value = (row.get(field) or "").strip()
    if not value:
        raise ProcessImportError(f"row {row_number}: {field} is required")
    return value


def _resolve_timezone(source_timezone: str) -> ZoneInfo:
    try:
        return ZoneInfo(source_timezone)
    except ZoneInfoNotFoundError as error:
        raise ProcessImportError(f"unknown source timezone: {source_timezone}") from error


def _check_headers(fieldnames: Sequence[str] | None) -> None:
    headers = set(fieldnames or ())
    missing = REQUIRED_HEADERS - headers
    if missing:
        raise ProcessImportError(f"missing required CSV headers: {', '.join(sorted(missing))}")


def _iter_rows(path: Path) -> Iterator[tuple[int, dict[str, str | None]]]:
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        _check_headers(reader.fieldnames)
        yield from enumerate(reader, start=1)


def _parse_timestamp(value: str, row_number: int, timezone: ZoneInfo) -> datetime:
    try:
        return datetime.strptime(value, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone)
    except ValueError as error:
        raise ProcessImportError(
            f"row {row_number}: TimeStamp must use YYYY-MM-DD HH:MM:SS"
        ) from error


def find_timestamp_range(path: Path, source_timezone: str) -> tuple[datetime, datetime] | None:
    """Return the earliest and latest TimeStamp in the CSV, if any."""
    timezone = _resolve_timezone(source_timezone)
    earliest: datetime | None = None
    latest: datetime | None = None
    for row_number, row in _iter_rows(path):
        timestamp = _required_text(row, "TimeStamp", row_number)
        parsed = _parse_timestamp(timestamp, row_number, timezone)
        earliest = parsed if earliest is None or parsed < earliest else earliest
        latest = parsed if latest is None or parsed > latest else latest
    if earliest is None or latest is None:
        return None
    return earliest, latest


def build_recent_transform(
    original_start: datetime,
    original_end: datetime,
    *,
    now: datetime,
    spread_days: int,
) -> Callable[[datetime], datetime]:
    """Map a CSV time range onto the last ``spread_days`` Korean calendar days."""
    if spread_days < 1:
        raise ProcessImportError("spread_days must be at least 1")
    target_end = now
    target_start = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(
        days=spread_days - 1
    )
    original_span = original_end - original_start
    if original_span <= timedelta(0):
        offset = target_end - original_end
        return lambda value: min(value + offset, target_end)
    ratio = (target_end - target_start) / original_span

    def transform(value: datetime) -> datetime:
        mapped = target_start + (value - original_start) * ratio
        return min(mapped, target_end)

    return transform


def _parse_cycle_time(value: str | None, row_number: int) -> Decimal | None:
    normalized = (value or "").strip()
    if not normalized:
        return None
    try:
        cycle_time = Decimal(normalized)
    except InvalidOperation as error:
        raise ProcessImportError(f"row {row_number}: Cycle_Time is not numeric") from error
    if not cycle_time.is_finite() or cycle_time < 0:
        raise ProcessImportError(f"row {row_number}: Cycle_Time must be finite and non-negative")
    return cycle_time


def read_process_csv(
    path: Path,
    source_timezone: str,
    *,
    timestamp_transform: Callable[[datetime], datetime] | None = None,
) -> Iterator[ParsedProcessRow]:
    timezone = _resolve_timezone(source_timezone)

    for row_number, row in _iter_rows(path):
        timestamp = _required_text(row, "TimeStamp", row_number)
        occurred_at = _parse_timestamp(timestamp, row_number, timezone)
        if timestamp_transform is not None:
            occurred_at = timestamp_transform(occurred_at)

        product_code = (row.get("PART_NO") or "").strip() or None
        payload = {key: value for key, value in row.items() if key is not None}
        yield ParsedProcessRow(
            row_number=row_number,
            source_record_key=_required_text(row, "_id", row_number),
            occurred_at=occurred_at,
            equipment_code=_required_text(row, "EQUIP_CD", row_number),
            equipment_name=_required_text(row, "EQUIP_NAME", row_number),
            product_code=product_code,
            product_name=_required_text(row, "PART_NAME", row_number),
            cycle_time_seconds=_parse_cycle_time(row.get("Cycle_Time"), row_number),
            source_payload=payload,
        )


class ProcessImportService:
    """Validates and imports one CSV atomically while resolving master data."""

    def __init__(
        self,
        session: Session,
        repository: ProcessImportRepository,
        clock: Callable[[], datetime] | None = None,
        batch_size: int = 1_000,
    ) -> None:
        if batch_size <= 0:
            raise ValueError("batch_size must be positive")
        self._session = session
        self._repository = repository
        self._clock = clock or (lambda: datetime.now(UTC))
        self._batch_size = batch_size

    def import_file(
        self,
        path: Path,
        *,
        source_timezone: str,
        source_namespace: str = "molding_csv",
        spread_over_days: int | None = None,
        publish_all: bool = False,
    ) -> ProcessImportResult:
        if not path.is_file():
            raise ProcessImportError(f"CSV file does not exist: {path}")
        if not source_namespace.strip():
            raise ProcessImportError("source_namespace is required")
        timestamp_transform: Callable[[datetime], datetime] | None = None
        if spread_over_days is not None:
            if spread_over_days < 1:
                raise ProcessImportError("spread_over_days must be at least 1")
            timestamp_range = find_timestamp_range(path, source_timezone)
            if timestamp_range is not None:
                timezone = _resolve_timezone(source_timezone)
                timestamp_transform = build_recent_transform(
                    *timestamp_range,
                    now=self._clock().astimezone(timezone),
                    spread_days=spread_over_days,
                )

        fingerprint = calculate_sha256(path)
        with self._session.begin():
            if self._repository.find_import_by_fingerprint(fingerprint) is not None:
                raise DuplicateSourceImportError("the same source file was already imported")

            started_at = self._clock()
            source_import = SourceImport(
                source_name=path.name,
                source_fingerprint=fingerprint,
                status="importing",
                started_at=started_at,
            )
            self._repository.add_import(source_import)

            equipment_cache: dict[str, Equipment] = {}
            product_cache: dict[tuple[str | None, str], Product] = {}
            batch: list[ParsedProcessRow] = []
            imported = 0
            skipped = 0
            created_equipment = 0
            created_products = 0
            last_row_number = 0
            last_occurred_at: datetime | None = None

            for parsed_row in read_process_csv(
                path, source_timezone, timestamp_transform=timestamp_transform
            ):
                last_row_number = max(last_row_number, parsed_row.row_number)
                if last_occurred_at is None or parsed_row.occurred_at > last_occurred_at:
                    last_occurred_at = parsed_row.occurred_at
                batch.append(parsed_row)
                if len(batch) < self._batch_size:
                    continue
                counts = self._import_batch(
                    batch,
                    source_import.id,
                    source_namespace,
                    equipment_cache,
                    product_cache,
                    publish_all,
                )
                imported += counts[0]
                skipped += counts[1]
                created_equipment += counts[2]
                created_products += counts[3]
                batch.clear()

            if batch:
                counts = self._import_batch(
                    batch,
                    source_import.id,
                    source_namespace,
                    equipment_cache,
                    product_cache,
                    publish_all,
                )
                imported += counts[0]
                skipped += counts[1]
                created_equipment += counts[2]
                created_products += counts[3]

            source_import.status = "completed"
            source_import.finished_at = self._clock()
            if publish_all:
                replay = ProcessReplay(
                    source_import_id=source_import.id,
                    cursor=last_row_number,
                    state="completed",
                    data_time=last_occurred_at,
                    last_advanced_at=source_import.finished_at,
                )
            else:
                replay = ProcessReplay(source_import_id=source_import.id, cursor=0, state="ready")
            self._repository.add_replay(replay)

        return ProcessImportResult(
            import_id=source_import.id,
            imported_records=imported,
            skipped_records=skipped,
            created_equipment=created_equipment,
            created_products=created_products,
        )

    def _import_batch(
        self,
        rows: list[ParsedProcessRow],
        source_import_id: int,
        namespace: str,
        equipment_cache: dict[str, Equipment],
        product_cache: dict[tuple[str | None, str], Product],
        publish_all: bool,
    ) -> tuple[int, int, int, int]:
        existing = self._repository.find_records_by_source_keys(
            namespace, {row.source_record_key for row in rows}
        )
        records: list[ProcessRecord] = []
        pending_payloads: dict[str, dict[str, Any]] = {}
        skipped = 0
        created_equipment = 0
        created_products = 0

        for row in rows:
            pending_payload = pending_payloads.get(row.source_record_key)
            if pending_payload is not None:
                if pending_payload != row.source_payload:
                    raise SourceRecordConflictError(
                        f"row {row.row_number}: source key has different content"
                    )
                skipped += 1
                continue

            existing_record = existing.get(row.source_record_key)
            if existing_record is not None:
                if existing_record.source_payload != row.source_payload:
                    raise SourceRecordConflictError(
                        f"row {row.row_number}: source key has different content"
                    )
                skipped += 1
                continue

            equipment, was_created = self._resolve_equipment(row, equipment_cache)
            created_equipment += int(was_created)
            product, was_created = self._resolve_product(row, product_cache)
            created_products += int(was_created)
            records.append(
                ProcessRecord(
                    source_import_id=source_import_id,
                    source_row_number=row.row_number,
                    equipment_id=equipment.id,
                    product_id=product.id,
                    occurred_at=row.occurred_at,
                    available_at=row.occurred_at if publish_all else None,
                    cycle_time_seconds=row.cycle_time_seconds,
                    source_namespace=namespace,
                    source_record_key=row.source_record_key,
                    source_payload=row.source_payload,
                    is_demo=True,
                    version=1,
                )
            )
            pending_payloads[row.source_record_key] = row.source_payload

        self._repository.add_records(records)
        return len(records), skipped, created_equipment, created_products

    def _resolve_equipment(
        self, row: ParsedProcessRow, cache: dict[str, Equipment]
    ) -> tuple[Equipment, bool]:
        equipment = cache.get(row.equipment_code) or self._repository.find_equipment(
            row.equipment_code
        )
        if equipment is None:
            equipment = Equipment(
                equipment_code=row.equipment_code, name=row.equipment_name, production_line_id=None
            )
            self._repository.add_equipment(equipment)
            cache[row.equipment_code] = equipment
            return equipment, True
        if equipment.name.strip() != row.equipment_name:
            raise MasterDataConflictError(
                f"row {row.row_number}: equipment code has a different name"
            )
        cache[row.equipment_code] = equipment
        return equipment, False

    def _resolve_product(
        self, row: ParsedProcessRow, cache: dict[tuple[str | None, str], Product]
    ) -> tuple[Product, bool]:
        cache_key = (row.product_code, row.product_name)
        if cached := cache.get(cache_key):
            return cached, False

        product = (
            self._repository.find_product_by_code(row.product_code) if row.product_code else None
        )
        if product is not None and product.name.strip() != row.product_name:
            raise MasterDataConflictError(
                f"row {row.row_number}: product code has a different name"
            )

        if product is None:
            uncoded = self._repository.find_uncoded_products_by_name(row.product_name)
            if len(uncoded) > 1:
                raise MasterDataConflictError(
                    f"row {row.row_number}: multiple uncoded products have the same name"
                )
            if uncoded:
                product = uncoded[0]
                if row.product_code:
                    product.product_code = row.product_code
            else:
                product = Product(product_code=row.product_code, name=row.product_name)
                self._repository.add_product(product)
                cache[cache_key] = product
                return product, True

        cache[cache_key] = product
        return product, False
