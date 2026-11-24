from datetime import UTC, date, datetime
from decimal import Decimal
from typing import cast
from unittest.mock import MagicMock

import pytest
from app.integrations.ai import AiGenerationError
from app.models.master import AppUser, Equipment, Product
from app.models.process import InspectionRecord, ProcessRecord
from app.models.report import Report
from app.repositories.record_history import (
    InspectionRecordView,
    ProcessRecordView,
)
from app.repositories.report import ReportView
from app.services.chat_tools import (
    ChatPlanError,
    ChatQueryPlan,
    ChatToolExecutor,
    parse_query_plan,
)
from app.services.master_data import MasterDataService
from app.services.quality import QualityService, QualitySummary
from app.services.record_history import RecordHistoryService
from app.services.report import ReportPage, ReportService
from sqlalchemy.orm import Session

NOW = datetime(2026, 11, 24, 6, 0, tzinfo=UTC)
TODAY = date(2026, 11, 24)
FROM = date(2026, 11, 18)


def make_actor() -> AppUser:
    return AppUser(
        id=1,
        employee_no="E001",
        display_name="사용자",
        password_hash="unused",
        role="worker",
        must_change_password=False,
        shift_start_local=datetime(2026, 1, 1, 9, 0).time(),
        shift_end_local=datetime(2026, 1, 1, 18, 0).time(),
        version=1,
    )


def make_product() -> Product:
    return Product(id=1, name="RG3 RH", product_code="P-1")


def make_equipment() -> Equipment:
    return Equipment(id=2, equipment_code="EQ-1", name="1호기")


def build_executor() -> tuple[ChatToolExecutor, dict[str, MagicMock]]:
    session = MagicMock(spec=Session)
    executor = ChatToolExecutor(session, clock=lambda: NOW)
    mocks = {
        "quality": MagicMock(spec=QualityService),
        "records": MagicMock(spec=RecordHistoryService),
        "reports": MagicMock(spec=ReportService),
        "master": MagicMock(spec=MasterDataService),
    }
    executor._quality = cast(QualityService, mocks["quality"])
    executor._records = cast(RecordHistoryService, mocks["records"])
    executor._reports = cast(ReportService, mocks["reports"])
    executor._master = cast(MasterDataService, mocks["master"])
    return executor, mocks


def test_parse_query_plan_accepts_fenced_json_and_rejects_bad_tools() -> None:
    plan = parse_query_plan('```json\n{"tool": "quality_summary", "arguments": {"days": 7}}\n```')
    assert plan.tool == "quality_summary"
    assert plan.arguments == {"days": 7}

    with pytest.raises(ChatPlanError):
        parse_query_plan('{"tool": "run_sql", "arguments": {}}')
    with pytest.raises(ChatPlanError):
        parse_query_plan('{"tool": "quality_summary", "arguments": {"days": 999}}')
    with pytest.raises(ChatPlanError):
        parse_query_plan('{"tool": "clarify"}')


def test_quality_summary_resolves_targets_and_records_scope() -> None:
    executor, mocks = build_executor()
    product = make_product()
    mocks["master"].list_products.return_value = [product]
    mocks["master"].list_equipment.return_value = []
    mocks["quality"].get_summary.return_value = QualitySummary(
        inspected_count=10,
        good_count=9,
        defect_count=1,
        defect_rate=Decimal("10.00"),
        defect_types=[("흑점", 1)],
        production_record_count=20,
        includes_demo=True,
    )

    result = executor.execute(
        ChatQueryPlan(tool="quality_summary", arguments={"days": 7, "product": "RG3 RH"}),
        actor=make_actor(),
        data_cutoff_at=NOW,
    )

    assert result.data["status"] == "ok"
    assert result.data["defect_count"] == 1
    assert result.data["defect_rate_percent"] == "10.00"
    assert result.data["defect_types"] == [{"type": "흑점", "count": 1}]
    assert result.scope["period"] == {"from": FROM.isoformat(), "to": TODAY.isoformat()}
    target = cast(dict[str, object], result.scope["target"])
    assert target["product_id"] == 1
    assert result.is_demo is True
    assert [item.product_id for item in result.evidence] == [1]
    mocks["quality"].get_summary.assert_called_once_with(
        equipment_id=None,
        product_id=1,
        date_from=FROM,
        date_to=TODAY,
        data_cutoff_at=NOW,
    )


def test_quality_summary_does_not_query_when_product_is_missing() -> None:
    executor, mocks = build_executor()
    mocks["master"].list_products.return_value = []

    result = executor.execute(
        ChatQueryPlan(tool="quality_summary", arguments={"product": "없는 제품"}),
        actor=make_actor(),
        data_cutoff_at=NOW,
    )

    assert result.data["status"] == "not_found"
    assert result.evidence == []
    mocks["quality"].get_summary.assert_not_called()


def test_inspection_records_returns_items_and_evidence() -> None:
    executor, mocks = build_executor()
    product = make_product()
    equipment = make_equipment()
    record = InspectionRecord(
        id=5,
        equipment_id=2,
        product_id=1,
        inspected_at=NOW,
        verdict="defect",
        defect_type="흑점",
        is_demo=True,
        version=1,
    )
    page = MagicMock()
    page.records = [InspectionRecordView(record=record, equipment=equipment, product=product)]
    page.total_items = 1
    mocks["records"].list_inspection_records.return_value = page

    result = executor.execute(
        ChatQueryPlan(
            tool="inspection_records",
            arguments={"days": 7, "verdict": "defect", "limit": 5},
        ),
        actor=make_actor(),
        data_cutoff_at=NOW,
    )

    assert result.data["total_count"] == 1
    assert result.data["items"] == [
        {
            "record_id": 5,
            "inspected_at": NOW.isoformat(),
            "product": "RG3 RH",
            "equipment": "EQ-1",
            "verdict": "defect",
            "defect_type": "흑점",
            "is_demo": True,
        }
    ]
    assert result.evidence[0].inspection_record_id == 5
    assert result.is_demo is True
    assert result.scope["verdict"] == "defect"


def test_process_records_returns_items_and_evidence() -> None:
    executor, mocks = build_executor()
    product = make_product()
    equipment = make_equipment()
    record = ProcessRecord(
        id=7,
        equipment_id=2,
        product_id=1,
        occurred_at=NOW,
        cycle_time_seconds=Decimal("12.500"),
        is_demo=False,
        version=1,
    )
    page = MagicMock()
    page.records = [ProcessRecordView(record=record, equipment=equipment, product=product)]
    page.total_items = 1
    mocks["records"].list_process_records.return_value = page

    result = executor.execute(
        ChatQueryPlan(tool="process_records", arguments={"limit": 3}),
        actor=make_actor(),
        data_cutoff_at=NOW,
    )

    items = cast(list[dict[str, object]], result.data["items"])
    assert items[0]["cycle_time_seconds"] == "12.500"
    assert result.evidence[0].process_record_id == 7
    assert result.is_demo is False


def test_report_search_uses_permission_scoped_service() -> None:
    executor, mocks = build_executor()
    actor = make_actor()
    report = Report(
        id=9,
        author_id=1,
        title="주간 품질 보고",
        body_markdown="본문",
        category="periodic_weekly",
        report_kind="weekly",
        business_status="pending",
        version=2,
    )
    report.created_at = NOW
    report.updated_at = NOW
    mocks["reports"].list_reports.return_value = ReportPage(
        reports=[
            ReportView(report=report, author_display_name="사용자", last_editor_display_name=None)
        ],
        total_items=1,
    )

    result = executor.execute(
        ChatQueryPlan(tool="report_search", arguments={"query": "품질", "days": 7, "limit": 5}),
        actor=actor,
        data_cutoff_at=NOW,
    )

    items = cast(list[dict[str, object]], result.data["items"])
    assert items[0]["report_id"] == 9
    assert result.evidence[0].report_id == 9
    assert result.evidence[0].source_version == 2
    mocks["reports"].list_reports.assert_called_once_with(
        actor,
        query="품질",
        category=None,
        business_status=None,
        date_from=FROM,
        date_to=TODAY,
        page=1,
        page_size=5,
    )


def test_clarify_is_returned_without_query() -> None:
    executor, mocks = build_executor()

    result = executor.execute(
        ChatQueryPlan(tool="clarify", question="어느 제품과 기간을 조회할까요?"),
        actor=make_actor(),
        data_cutoff_at=NOW,
    )

    assert result.clarification == "어느 제품과 기간을 조회할까요?"
    assert result.evidence == []
    mocks["quality"].get_summary.assert_not_called()

    with pytest.raises(AiGenerationError):
        executor.execute(
            ChatQueryPlan(tool="clarify", question="<script>alert(1)</script>"),
            actor=make_actor(),
            data_cutoff_at=NOW,
        )
