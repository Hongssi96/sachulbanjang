from datetime import UTC, datetime
from decimal import Decimal
from unittest.mock import MagicMock

import pytest
from app.models.master import AppUser, Equipment, Product
from app.models.process import InspectionRecord, ProcessRecord, RecordChange
from app.repositories.record_correction import RecordChangeView, RecordCorrectionRepository
from app.repositories.record_history import InspectionRecordView, ProcessRecordView
from app.services.record_correction import (
    NoRecordChangeError,
    RecordCorrectionService,
    RecordVersionConflictError,
)
from app.services.record_history import RecordNotFoundError
from sqlalchemy.orm import Session

NOW = datetime(2026, 11, 23, 4, 0, tzinfo=UTC)
OCCURRED = datetime(2026, 11, 20, 3, 0, tzinfo=UTC)


def make_view(record_id: int = 1, version: int = 1) -> ProcessRecordView:
    equipment = Equipment(id=20, equipment_code="S01", name="사출기 1")
    product = Product(id=30, product_code="P-1", name="시연 제품")
    record = ProcessRecord(
        id=record_id,
        source_import_id=10,
        source_row_number=1,
        equipment_id=20,
        product_id=30,
        occurred_at=OCCURRED,
        available_at=OCCURRED,
        cycle_time_seconds=Decimal("12.345"),
        source_namespace="test",
        source_record_key="row-1",
        source_payload={"_id": "row-1"},
        is_demo=True,
        version=version,
    )
    return ProcessRecordView(record=record, equipment=equipment, product=product)


class FakeCorrectionRepository(RecordCorrectionRepository):
    def __init__(self, view: ProcessRecordView | None) -> None:
        self.view = view
        self.changes: list[RecordChange] = []

    def find_process_record_for_update(self, record_id: int) -> ProcessRecordView | None:
        if self.view is not None and self.view.record.id == record_id:
            return self.view
        return None

    def find_process_record(self, record_id: int) -> ProcessRecordView | None:
        return self.find_process_record_for_update(record_id)

    def add_change(self, change: RecordChange) -> None:
        self.changes.append(change)

    def list_process_changes(self, record_id: int) -> list[RecordChangeView]:
        return []


def build_service(
    view: ProcessRecordView | None = None,
) -> tuple[RecordCorrectionService, FakeCorrectionRepository, MagicMock]:
    session = MagicMock(spec=Session)
    repository = FakeCorrectionRepository(view)
    service = RecordCorrectionService(session, repository, clock=lambda: NOW)
    return service, repository, session


def make_inspection_view(record_id: int = 1, version: int = 1) -> InspectionRecordView:
    equipment = Equipment(id=20, equipment_code="S01", name="사출기 1")
    product = Product(id=30, product_code="P-1", name="시연 제품")
    record = InspectionRecord(
        id=record_id,
        equipment_id=20,
        product_id=30,
        process_record_id=5,
        inspected_at=OCCURRED,
        available_at=OCCURRED,
        verdict="defect",
        defect_type="scratch",
        reason="표면 긁힘",
        is_demo=True,
        version=version,
    )
    return InspectionRecordView(record=record, equipment=equipment, product=product)


class FakeInspectionCorrectionRepository(RecordCorrectionRepository):
    def __init__(self, view: InspectionRecordView | None) -> None:
        self.view = view
        self.changes: list[RecordChange] = []

    def find_inspection_record_for_update(self, record_id: int) -> InspectionRecordView | None:
        if self.view is not None and self.view.record.id == record_id:
            return self.view
        return None

    def find_inspection_record(self, record_id: int) -> InspectionRecordView | None:
        return self.find_inspection_record_for_update(record_id)

    def add_change(self, change: RecordChange) -> None:
        self.changes.append(change)

    def list_inspection_changes(self, record_id: int) -> list[RecordChangeView]:
        return []


def actor() -> AppUser:
    return AppUser(id=9, employee_no="A9001", role="admin", display_name="관리자")


def build_inspection_service(
    view: InspectionRecordView | None = None,
) -> tuple[RecordCorrectionService, FakeInspectionCorrectionRepository, MagicMock]:
    session = MagicMock(spec=Session)
    repository = FakeInspectionCorrectionRepository(view)
    service = RecordCorrectionService(session, repository, clock=lambda: NOW)
    return service, repository, session


def test_update_process_record_applies_changes_and_records_history() -> None:
    view = make_view()
    service, repository, session = build_service(view)

    updated = service.update_process_record(
        actor(),
        1,
        version=1,
        change_reason="사이클 시간 오입력 정정",
        changes={"cycle_time_seconds": Decimal("11.000")},
    )

    assert updated.record.cycle_time_seconds == Decimal("11.000")
    assert updated.record.version == 2
    session.commit.assert_called_once_with()
    assert len(repository.changes) == 1
    change = repository.changes[0]
    assert change.process_record_id == 1
    assert change.actor_id == 9
    assert change.operation == "update"
    assert change.before_value == {"cycle_time_seconds": "12.345"}
    assert change.after_value == {"cycle_time_seconds": "11.000"}
    assert change.reason == "사이클 시간 오입력 정정"
    assert change.version == 2
    assert change.occurred_at == NOW


def test_update_process_record_allows_clearing_nullable_product() -> None:
    view = make_view()
    service, repository, _ = build_service(view)

    service.update_process_record(
        actor(),
        1,
        version=1,
        change_reason="품목 연결 해제",
        changes={"product_id": None},
    )

    assert view.record.product_id is None
    assert repository.changes[0].after_value == {"product_id": None}


def test_update_process_record_rejects_stale_version() -> None:
    service, _, session = build_service(make_view(version=3))

    with pytest.raises(RecordVersionConflictError) as caught:
        service.update_process_record(
            actor(),
            1,
            version=1,
            change_reason="정정",
            changes={"cycle_time_seconds": Decimal("1")},
        )

    assert caught.value.current_version == 3
    session.commit.assert_not_called()


def test_update_process_record_rejects_missing_record() -> None:
    service, _, session = build_service(None)

    with pytest.raises(RecordNotFoundError):
        service.update_process_record(
            actor(),
            1,
            version=1,
            change_reason="정정",
            changes={"cycle_time_seconds": Decimal("1")},
        )

    session.commit.assert_not_called()


def test_update_process_record_rejects_no_effective_change() -> None:
    service, _, session = build_service(make_view())

    with pytest.raises(NoRecordChangeError):
        service.update_process_record(
            actor(),
            1,
            version=1,
            change_reason="정정",
            changes={"cycle_time_seconds": Decimal("12.345")},
        )

    with pytest.raises(NoRecordChangeError):
        service.update_process_record(actor(), 1, version=1, change_reason="정정", changes={})

    with pytest.raises(NoRecordChangeError):
        service.update_process_record(
            actor(), 1, version=1, change_reason="정정", changes={"source_record_key": "x"}
        )

    session.commit.assert_not_called()


def test_update_inspection_record_applies_verdict_and_records_history() -> None:
    view = make_inspection_view()
    service, repository, session = build_inspection_service(view)

    updated = service.update_inspection_record(
        actor(),
        1,
        version=1,
        change_reason="판정 정정",
        changes={"verdict": "good", "defect_type": None},
    )

    assert updated.record.verdict == "good"
    assert updated.record.defect_type is None
    assert updated.record.version == 2
    session.commit.assert_called_once_with()
    change = repository.changes[0]
    assert change.inspection_record_id == 1
    assert change.before_value == {"defect_type": "scratch", "verdict": "defect"}
    assert change.after_value == {"defect_type": None, "verdict": "good"}


def test_update_inspection_record_rejects_stale_version_and_missing_record() -> None:
    service, _, session = build_inspection_service(make_inspection_view(version=4))
    with pytest.raises(RecordVersionConflictError):
        service.update_inspection_record(
            actor(), 1, version=1, change_reason="정정", changes={"verdict": "good"}
        )

    service, _, _ = build_inspection_service(None)
    with pytest.raises(RecordNotFoundError):
        service.update_inspection_record(
            actor(), 1, version=1, change_reason="정정", changes={"verdict": "good"}
        )

    session.commit.assert_not_called()


def test_update_inspection_record_rejects_no_effective_change() -> None:
    service, _, _ = build_inspection_service(make_inspection_view())

    with pytest.raises(NoRecordChangeError):
        service.update_inspection_record(
            actor(), 1, version=1, change_reason="정정", changes={"verdict": "defect"}
        )

    with pytest.raises(NoRecordChangeError):
        service.update_inspection_record(
            actor(), 1, version=1, change_reason="정정", changes={"source_record_key": "x"}
        )


def test_list_inspection_changes_requires_existing_record() -> None:
    service, _, _ = build_inspection_service(None)
    with pytest.raises(RecordNotFoundError):
        service.list_inspection_changes(1)

    service, _, _ = build_inspection_service(make_inspection_view())
    assert service.list_inspection_changes(1) == []


def test_list_process_changes_requires_existing_record() -> None:
    service, _, _ = build_service(None)

    with pytest.raises(RecordNotFoundError):
        service.list_process_changes(1)

    service, _, _ = build_service(make_view())
    assert service.list_process_changes(1) == []


def test_delete_process_record_soft_deletes_and_records_history() -> None:
    view = make_view()
    service, repository, session = build_service(view)

    service.delete_process_record(actor(), 1, version=1, change_reason="원천 데이터 오류 삭제")

    assert view.record.deleted_at == NOW
    assert view.record.version == 2
    session.commit.assert_called_once_with()
    change = repository.changes[0]
    assert change.process_record_id == 1
    assert change.operation == "delete"
    assert change.after_value is None
    assert change.before_value == {
        "occurred_at": OCCURRED.isoformat(),
        "cycle_time_seconds": "12.345",
        "product_id": 30,
        "equipment_id": 20,
        "is_demo": True,
    }
    assert change.reason == "원천 데이터 오류 삭제"
    assert change.occurred_at == NOW


def test_delete_process_record_rejects_stale_version_and_missing_record() -> None:
    service, _, session = build_service(make_view(version=3))

    with pytest.raises(RecordVersionConflictError):
        service.delete_process_record(actor(), 1, version=1, change_reason="사유")
    session.commit.assert_not_called()

    service, _, _ = build_service(None)
    with pytest.raises(RecordNotFoundError):
        service.delete_process_record(actor(), 1, version=1, change_reason="사유")


def test_delete_inspection_record_soft_deletes_and_records_history() -> None:
    view = make_inspection_view()
    service, repository, session = build_inspection_service(view)

    service.delete_inspection_record(actor(), 1, version=1, change_reason="검사 오등록 삭제")

    assert view.record.deleted_at == NOW
    assert view.record.version == 2
    session.commit.assert_called_once_with()
    change = repository.changes[0]
    assert change.inspection_record_id == 1
    assert change.operation == "delete"
    assert change.after_value is None
    assert change.reason == "검사 오등록 삭제"
