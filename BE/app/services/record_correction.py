from __future__ import annotations

from collections.abc import Callable, Mapping
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.master import AppUser
from app.models.process import InspectionRecord, ProcessRecord, RecordChange
from app.repositories.record_correction import RecordChangeView, RecordCorrectionRepository
from app.repositories.record_history import InspectionRecordView, ProcessRecordView
from app.services.record_history import RecordNotFoundError

Clock = Callable[[], datetime]

PROCESS_EDITABLE_FIELDS = frozenset(
    {"occurred_at", "cycle_time_seconds", "product_id", "equipment_id"}
)
INSPECTION_EDITABLE_FIELDS = frozenset(
    {"inspected_at", "product_id", "process_record_id", "verdict", "defect_type", "reason"}
)


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _serialize(value: object) -> object:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    return value


def _process_snapshot(record: ProcessRecord) -> dict[str, object]:
    return {
        "occurred_at": _serialize(record.occurred_at),
        "cycle_time_seconds": _serialize(record.cycle_time_seconds),
        "product_id": record.product_id,
        "equipment_id": record.equipment_id,
        "is_demo": record.is_demo,
    }


def _inspection_snapshot(record: InspectionRecord) -> dict[str, object]:
    return {
        "inspected_at": _serialize(record.inspected_at),
        "product_id": record.product_id,
        "process_record_id": record.process_record_id,
        "verdict": record.verdict,
        "defect_type": record.defect_type,
        "reason": record.reason,
        "is_demo": record.is_demo,
    }


class RecordVersionConflictError(Exception):
    """Raised when a correction is based on an outdated record version."""

    def __init__(self, current_version: int) -> None:
        self.current_version = current_version
        super().__init__("record was changed by another request")


class NoRecordChangeError(Exception):
    """Raised when a correction does not change any editable field."""


class RecordCorrectionService:
    """Apply administrator corrections and keep a before/after audit record."""

    def __init__(
        self,
        session: Session,
        repository: RecordCorrectionRepository,
        clock: Clock = _utc_now,
    ) -> None:
        self._session = session
        self._repository = repository
        self._clock = clock

    def update_process_record(
        self,
        actor: AppUser,
        record_id: int,
        *,
        version: int,
        change_reason: str,
        changes: Mapping[str, object],
    ) -> ProcessRecordView:
        view = self._repository.find_process_record_for_update(record_id)
        if view is None:
            raise RecordNotFoundError
        record = view.record
        if record.version != version:
            raise RecordVersionConflictError(record.version)
        if not changes or set(changes) - PROCESS_EDITABLE_FIELDS:
            raise NoRecordChangeError

        before: dict[str, object] = {}
        after: dict[str, object] = {}
        for field, new_value in changes.items():
            current = getattr(record, field)
            if new_value == current:
                continue
            before[field] = _serialize(current)
            after[field] = _serialize(new_value)
            setattr(record, field, new_value)

        if not before:
            raise NoRecordChangeError

        record.version += 1
        self._repository.add_change(
            RecordChange(
                process_record_id=record.id,
                actor_id=actor.id,
                operation="update",
                before_value=before,
                after_value=after,
                reason=change_reason,
                version=record.version,
                occurred_at=self._clock(),
            )
        )
        self._session.commit()

        refreshed = self._repository.find_process_record(record.id)
        if refreshed is None:
            raise RecordNotFoundError
        return refreshed

    def list_process_changes(self, record_id: int) -> list[RecordChangeView]:
        if self._repository.find_process_record(record_id) is None:
            raise RecordNotFoundError
        return self._repository.list_process_changes(record_id)

    def delete_process_record(
        self, actor: AppUser, record_id: int, *, version: int, change_reason: str
    ) -> None:
        view = self._repository.find_process_record_for_update(record_id)
        if view is None:
            raise RecordNotFoundError
        record = view.record
        if record.version != version:
            raise RecordVersionConflictError(record.version)
        now = self._clock()
        snapshot = _process_snapshot(record)
        record.deleted_at = now
        record.version += 1
        self._repository.add_change(
            RecordChange(
                process_record_id=record.id,
                actor_id=actor.id,
                operation="delete",
                before_value=snapshot,
                after_value=None,
                reason=change_reason,
                version=record.version,
                occurred_at=now,
            )
        )
        self._session.commit()

    def update_inspection_record(
        self,
        actor: AppUser,
        record_id: int,
        *,
        version: int,
        change_reason: str,
        changes: Mapping[str, object],
    ) -> InspectionRecordView:
        view = self._repository.find_inspection_record_for_update(record_id)
        if view is None:
            raise RecordNotFoundError
        record = view.record
        if record.version != version:
            raise RecordVersionConflictError(record.version)
        if not changes or set(changes) - INSPECTION_EDITABLE_FIELDS:
            raise NoRecordChangeError

        before: dict[str, object] = {}
        after: dict[str, object] = {}
        for field, new_value in changes.items():
            current = getattr(record, field)
            if new_value == current:
                continue
            before[field] = _serialize(current)
            after[field] = _serialize(new_value)
            setattr(record, field, new_value)

        if not before:
            raise NoRecordChangeError

        record.version += 1
        self._repository.add_change(
            RecordChange(
                inspection_record_id=record.id,
                actor_id=actor.id,
                operation="update",
                before_value=before,
                after_value=after,
                reason=change_reason,
                version=record.version,
                occurred_at=self._clock(),
            )
        )
        self._session.commit()

        refreshed = self._repository.find_inspection_record(record.id)
        if refreshed is None:
            raise RecordNotFoundError
        return refreshed

    def list_inspection_changes(self, record_id: int) -> list[RecordChangeView]:
        if self._repository.find_inspection_record(record_id) is None:
            raise RecordNotFoundError
        return self._repository.list_inspection_changes(record_id)

    def delete_inspection_record(
        self, actor: AppUser, record_id: int, *, version: int, change_reason: str
    ) -> None:
        view = self._repository.find_inspection_record_for_update(record_id)
        if view is None:
            raise RecordNotFoundError
        record = view.record
        if record.version != version:
            raise RecordVersionConflictError(record.version)
        now = self._clock()
        snapshot = _inspection_snapshot(record)
        record.deleted_at = now
        record.version += 1
        self._repository.add_change(
            RecordChange(
                inspection_record_id=record.id,
                actor_id=actor.id,
                operation="delete",
                before_value=snapshot,
                after_value=None,
                reason=change_reason,
                version=record.version,
                occurred_at=now,
            )
        )
        self._session.commit()
