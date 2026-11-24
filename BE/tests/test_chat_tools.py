from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import cast
from unittest.mock import MagicMock

import pytest
from app.integrations.ai import AiGenerationError
from app.models.master import AppUser, Equipment, Product
from app.models.process import InspectionRecord, ProcessRecord
from app.models.report import Report
from app.models.schedule import Schedule
from app.models.stock import StockMovement
from app.repositories.inventory import MovementRow, StockRow
from app.repositories.record_history import (
    InspectionRecordView,
    ProcessRecordView,
)
from app.repositories.report import ReportView
from app.repositories.schedule import ScheduleView
from app.services.chat_tools import (
    ChatPlanError,
    ChatQueryPlan,
    ChatToolExecutor,
    parse_query_plan,
)
from app.services.inventory import InventoryService
from app.services.master_data import MasterDataService
from app.services.operation import OperationService, OperationSummary
from app.services.quality import QualityService, QualitySummary
from app.services.record_history import RecordHistoryService
from app.services.report import ReportPage, ReportService
from app.services.schedule import ScheduleService
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
        "inventory": MagicMock(spec=InventoryService),
        "schedules": MagicMock(spec=ScheduleService),
        "operations": MagicMock(spec=OperationService),
    }
    executor._quality = cast(QualityService, mocks["quality"])
    executor._records = cast(RecordHistoryService, mocks["records"])
    executor._reports = cast(ReportService, mocks["reports"])
    executor._master = cast(MasterDataService, mocks["master"])
    executor._inventory = cast(InventoryService, mocks["inventory"])
    executor._schedules = cast(ScheduleService, mocks["schedules"])
    executor._operations = cast(OperationService, mocks["operations"])
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
    assert result.scope["data_cutoff_label"] == "2026-11-24 15:00 (KST)"
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


def test_parse_query_plan_accepts_extended_tools() -> None:
    stock = parse_query_plan('{"tool": "stock_status", "arguments": {"low_stock": true}}')
    assert stock.tool == "stock_status"
    movements = parse_query_plan('{"tool": "stock_movements", "arguments": {"kind": "receipt"}}')
    assert movements.tool == "stock_movements"
    schedules = parse_query_plan('{"tool": "schedule_list", "arguments": {"days": 7}}')
    assert schedules.tool == "schedule_list"
    operation = parse_query_plan('{"tool": "operation_summary", "arguments": {"days": 7}}')
    assert operation.tool == "operation_summary"

    with pytest.raises(ChatPlanError):
        parse_query_plan('{"tool": "stock_movements", "arguments": {"kind": "unknown"}}')
    with pytest.raises(ChatPlanError):
        parse_query_plan('{"tool": "schedule_list", "arguments": {"category": "meeting"}}')


def test_stock_status_returns_balances_and_evidence() -> None:
    executor, mocks = build_executor()
    product = make_product()
    product.minimum_stock = 5
    mocks["master"].list_products.return_value = [product]
    page = MagicMock()
    page.rows = [StockRow(product=product, quantity=3)]
    page.total_items = 1
    mocks["inventory"].list_stocks.return_value = page

    result = executor.execute(
        ChatQueryPlan(tool="stock_status", arguments={"product": "RG3 RH"}),
        actor=make_actor(),
        data_cutoff_at=NOW,
    )

    items = cast(list[dict[str, object]], result.data["items"])
    assert items[0]["quantity"] == 3
    assert items[0]["is_low_stock"] is True
    assert result.evidence[0].product_id == 1
    mocks["inventory"].list_stocks.assert_called_once_with(
        query="RG3 RH",
        low_stock_only=False,
        page=1,
        page_size=10,
    )


def test_stock_status_does_not_query_when_product_is_missing() -> None:
    executor, mocks = build_executor()
    mocks["master"].list_products.return_value = []

    result = executor.execute(
        ChatQueryPlan(tool="stock_status", arguments={"product": "없는 제품"}),
        actor=make_actor(),
        data_cutoff_at=NOW,
    )

    assert result.data["status"] == "not_found"
    assert result.evidence == []
    mocks["inventory"].list_stocks.assert_not_called()


def test_stock_movements_returns_ledger_items() -> None:
    executor, mocks = build_executor()
    product = make_product()
    mocks["master"].list_products.return_value = [product]
    movement = StockMovement(
        id=3,
        product_id=1,
        actor_id=1,
        kind="issue",
        delta=-2,
        reason="출고",
        created_at=NOW,
    )
    page = MagicMock()
    page.rows = [
        MovementRow(
            movement=movement,
            product_code="P-1",
            product_name="RG3 RH",
            actor_display_name="사용자",
        )
    ]
    page.total_items = 1
    mocks["inventory"].list_movements.return_value = page

    result = executor.execute(
        ChatQueryPlan(
            tool="stock_movements",
            arguments={"days": 7, "product": "RG3 RH", "kind": "issue"},
        ),
        actor=make_actor(),
        data_cutoff_at=NOW,
    )

    movement_items = cast(list[dict[str, object]], result.data["items"])
    assert movement_items[0]["delta"] == -2
    assert movement_items[0]["is_checked"] is False
    assert result.data["kind"] == "issue"
    assert result.evidence[0].product_id == 1
    mocks["inventory"].list_movements.assert_called_once_with(
        product_id=1,
        kind="issue",
        date_from=FROM,
        date_to=TODAY,
        page=1,
        page_size=10,
    )


def test_schedule_list_returns_schedules() -> None:
    executor, mocks = build_executor()
    schedule = Schedule(
        id=4,
        author_id=1,
        title="설비 점검",
        category="inspection",
        all_day=True,
        start_date=date(2026, 11, 24),
        end_date_exclusive=date(2026, 11, 25),
        version=1,
    )
    page = MagicMock()
    page.schedules = [ScheduleView(schedule=schedule, author_display_name="사용자")]
    page.total_items = 1
    mocks["schedules"].list_schedules.return_value = page

    result = executor.execute(
        ChatQueryPlan(tool="schedule_list", arguments={"days": 7, "limit": 5}),
        actor=make_actor(),
        data_cutoff_at=NOW,
    )

    schedule_items = cast(list[dict[str, object]], result.data["items"])
    assert schedule_items[0]["title"] == "설비 점검"
    assert schedule_items[0]["start_date"] == "2026-11-24"
    assert result.evidence == []
    assert result.scope["window"] == "upcoming"
    mocks["schedules"].list_schedules.assert_called_once_with(
        date_from=TODAY,
        date_to=TODAY + timedelta(days=6),
        page=1,
        page_size=5,
    )


def test_schedule_list_recent_and_around_windows() -> None:
    executor, mocks = build_executor()
    page = MagicMock()
    page.schedules = []
    page.total_items = 0
    mocks["schedules"].list_schedules.return_value = page

    executor.execute(
        ChatQueryPlan(tool="schedule_list", arguments={"days": 3, "window": "recent"}),
        actor=make_actor(),
        data_cutoff_at=NOW,
    )
    recent_kwargs = mocks["schedules"].list_schedules.call_args.kwargs
    assert recent_kwargs["date_from"] == TODAY - timedelta(days=2)
    assert recent_kwargs["date_to"] == TODAY

    executor.execute(
        ChatQueryPlan(tool="schedule_list", arguments={"days": 3, "window": "around"}),
        actor=make_actor(),
        data_cutoff_at=NOW,
    )
    around_kwargs = mocks["schedules"].list_schedules.call_args.kwargs
    assert around_kwargs["date_from"] == TODAY - timedelta(days=2)
    assert around_kwargs["date_to"] == TODAY + timedelta(days=2)


def test_parse_query_plan_rejects_unknown_schedule_window() -> None:
    with pytest.raises(ChatPlanError):
        parse_query_plan('{"tool": "schedule_list", "arguments": {"window": "next"}}')


def test_operation_summary_returns_hours_and_rate() -> None:
    executor, mocks = build_executor()
    equipment = make_equipment()
    mocks["master"].list_equipment.return_value = [equipment]
    mocks["operations"].get_summary.return_value = OperationSummary(
        planned_seconds=28800,
        actual_seconds=21600,
        rate=Decimal("75.00"),
        includes_demo=True,
    )

    result = executor.execute(
        ChatQueryPlan(
            tool="operation_summary",
            arguments={"days": 7, "equipment": "EQ-1"},
        ),
        actor=make_actor(),
        data_cutoff_at=None,
    )

    assert result.data["planned_hours"] == "8.00"
    assert result.data["actual_hours"] == "6.00"
    assert result.data["operation_rate_percent"] == "75.00"
    assert result.data["includes_demo"] is True
    assert result.is_demo is True
    assert result.evidence == []
    mocks["operations"].get_summary.assert_called_once_with(
        equipment_id=2,
        date_from=FROM,
        date_to=TODAY,
    )


def test_operation_summary_without_equipment_filter() -> None:
    executor, mocks = build_executor()
    mocks["operations"].get_summary.return_value = OperationSummary(
        planned_seconds=0,
        actual_seconds=0,
        rate=None,
        includes_demo=False,
    )

    result = executor.execute(
        ChatQueryPlan(tool="operation_summary", arguments={"days": 1}),
        actor=make_actor(),
        data_cutoff_at=None,
    )

    assert result.data["operation_rate_percent"] is None
    assert result.data["planned_hours"] == "0.00"
    mocks["operations"].get_summary.assert_called_once_with(
        equipment_id=None,
        date_from=TODAY,
        date_to=TODAY,
    )
