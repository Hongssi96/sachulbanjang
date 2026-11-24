from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from sqlalchemy.orm import Session

from app.integrations.ai import validate_generated_markdown
from app.models.master import AppUser, Equipment, Product
from app.repositories.inventory import InventoryRepository
from app.repositories.master_data import MasterDataRepository
from app.repositories.quality import QualityRepository
from app.repositories.record_history import RecordHistoryRepository
from app.repositories.report import ReportRepository
from app.repositories.schedule import ScheduleRepository
from app.services.inventory import InventoryService
from app.services.master_data import MasterDataService
from app.services.quality import QualityService
from app.services.record_history import SEOUL, RecordHistoryService
from app.services.report import ReportService
from app.services.schedule import ScheduleService

Clock = Callable[[], datetime]

ChatToolName = Literal[
    "quality_summary",
    "inspection_records",
    "process_records",
    "report_search",
    "stock_status",
    "stock_movements",
    "schedule_list",
    "clarify",
]
_READ_TOOL_NAMES = (
    "quality_summary",
    "inspection_records",
    "process_records",
    "report_search",
    "stock_status",
    "stock_movements",
    "schedule_list",
)
_MAX_PLAN_LENGTH = 4_000

TOOL_CATALOG = """사용 가능한 조회 도구는 다음과 같습니다.
1. quality_summary: 기간 내 검사 수량·양품·불량·불량률·불량 유형과 생산 기록 건수 집계
   arguments: {"days": 1~90, "product": "제품명 또는 코드(선택)", "equipment": "설비 코드 또는 이름(선택)"}
2. inspection_records: 기간 내 검사 기록 목록(최신순)
   arguments: {"days": 1~90, "product": "선택", "equipment": "선택", "verdict": "good|defect(선택)", "limit": 1~20}
3. process_records: 기간 내 생산 기록 목록(최신순)
   arguments: {"days": 1~90, "product": "선택", "equipment": "선택", "limit": 1~20}
4. report_search: 조회 권한이 있는 보고서 검색(최신순)
   arguments: {"query": "제목·본문 검색어(선택)", "days": 1~90, "limit": 1~10}
5. stock_status: 제품별 현재 재고와 최소 재고·부족 여부
   arguments: {"product": "제품명 또는 코드(선택)", "low_stock": "부족한 제품만 true(선택)", "limit": 1~20}
6. stock_movements: 기간 내 입출고·조정 이력(최신순)
   arguments: {"days": 1~90, "product": "선택", "kind": "initial|receipt|issue|adjustment|correction(선택)", "limit": 1~20}
7. schedule_list: 기간과 겹치는 일정(시작 순)
   arguments: {"days": 1~90, "limit": 1~20}

질문 예시와 도구 선택: 불량률·검사 집계→quality_summary, 검사 기록→inspection_records,
생산 기록→process_records, 보고서→report_search, 재고 수량·부족→stock_status,
입출고·조정 이력→stock_movements, 일정→schedule_list.

조회 도구로 답할 수 없거나 대상·기간이 모호하면 clarify를 사용합니다.
{"tool": "clarify", "question": "사용자에게 되물을 짧은 질문"}
"""


class ChatPlanError(Exception):
    """Raised when the AI query plan is missing, malformed, or out of bounds."""


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _period(days: int, today: date) -> tuple[date, date]:
    return today - timedelta(days=days - 1), today


class _ToolArguments(BaseModel):
    model_config = ConfigDict(extra="forbid")


class QualitySummaryArguments(_ToolArguments):
    days: int = Field(default=7, ge=1, le=90)
    product: str | None = Field(default=None, max_length=100)
    equipment: str | None = Field(default=None, max_length=100)

    @field_validator("product", "equipment", mode="before")
    @classmethod
    def blank_to_none(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip() or None
        return value


class InspectionRecordsArguments(_ToolArguments):
    days: int = Field(default=7, ge=1, le=90)
    product: str | None = Field(default=None, max_length=100)
    equipment: str | None = Field(default=None, max_length=100)
    verdict: Literal["good", "defect"] | None = None
    limit: int = Field(default=10, ge=1, le=20)

    @field_validator("product", "equipment", mode="before")
    @classmethod
    def blank_to_none(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip() or None
        return value


class ProcessRecordsArguments(_ToolArguments):
    days: int = Field(default=7, ge=1, le=90)
    product: str | None = Field(default=None, max_length=100)
    equipment: str | None = Field(default=None, max_length=100)
    limit: int = Field(default=10, ge=1, le=20)

    @field_validator("product", "equipment", mode="before")
    @classmethod
    def blank_to_none(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip() or None
        return value


class ReportSearchArguments(_ToolArguments):
    query: str | None = Field(default=None, max_length=100)
    days: int = Field(default=30, ge=1, le=90)
    limit: int = Field(default=5, ge=1, le=10)

    @field_validator("query", mode="before")
    @classmethod
    def blank_to_none(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip() or None
        return value


class StockStatusArguments(_ToolArguments):
    product: str | None = Field(default=None, max_length=100)
    low_stock: bool = False
    limit: int = Field(default=10, ge=1, le=20)

    @field_validator("product", mode="before")
    @classmethod
    def blank_to_none(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip() or None
        return value


class StockMovementsArguments(_ToolArguments):
    days: int = Field(default=7, ge=1, le=90)
    product: str | None = Field(default=None, max_length=100)
    kind: Literal["initial", "receipt", "issue", "adjustment", "correction"] | None = None
    limit: int = Field(default=10, ge=1, le=20)

    @field_validator("product", mode="before")
    @classmethod
    def blank_to_none(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip() or None
        return value


class ScheduleListArguments(_ToolArguments):
    days: int = Field(default=7, ge=1, le=90)
    limit: int = Field(default=10, ge=1, le=20)


_ARGUMENT_MODELS: dict[str, type[_ToolArguments]] = {
    "quality_summary": QualitySummaryArguments,
    "inspection_records": InspectionRecordsArguments,
    "process_records": ProcessRecordsArguments,
    "report_search": ReportSearchArguments,
    "stock_status": StockStatusArguments,
    "stock_movements": StockMovementsArguments,
    "schedule_list": ScheduleListArguments,
}

_ArgumentsT = TypeVar("_ArgumentsT", bound=_ToolArguments)


class ChatQueryPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tool: ChatToolName
    arguments: dict[str, object] = Field(default_factory=dict)
    question: str | None = Field(default=None, max_length=500)


def parse_query_plan(raw: str) -> ChatQueryPlan:
    """Parse and validate the AI planner response without executing anything."""
    text = raw.strip()
    if len(text) > _MAX_PLAN_LENGTH:
        raise ChatPlanError("planner response is too long")
    if text.startswith("```"):
        lines = text.splitlines()
        if len(lines) >= 3 and lines[-1].strip().startswith("```"):
            text = "\n".join(lines[1:-1]).strip()
    try:
        payload = json.loads(text)
    except (ValueError, TypeError) as error:
        raise ChatPlanError("planner response is not valid JSON") from error
    if not isinstance(payload, dict):
        raise ChatPlanError("planner response must be a JSON object")
    try:
        plan = ChatQueryPlan.model_validate(payload)
    except ValidationError as error:
        raise ChatPlanError("planner response does not match the tool schema") from error
    if plan.tool in _READ_TOOL_NAMES:
        model = _ARGUMENT_MODELS[plan.tool]
        try:
            model.model_validate(plan.arguments)
        except ValidationError as error:
            raise ChatPlanError("planner arguments are out of bounds") from error
    elif not plan.question or not plan.question.strip():
        raise ChatPlanError("clarification question is required")
    return plan


@dataclass(frozen=True)
class EvidenceSource:
    report_id: int | None = None
    process_record_id: int | None = None
    inspection_record_id: int | None = None
    product_id: int | None = None
    source_version: int | None = None
    source_time: datetime | None = None


@dataclass(frozen=True)
class ChatQueryResult:
    tool: str
    data: dict[str, object]
    scope: dict[str, object]
    evidence: list[EvidenceSource] = field(default_factory=list)
    is_demo: bool = False
    clarification: str | None = None


class ChatToolExecutor:
    """Run only the server-validated read tools exposed to the chat worker."""

    def __init__(self, session: Session, clock: Clock = _utc_now) -> None:
        self._quality = QualityService(QualityRepository(session))
        self._records = RecordHistoryService(RecordHistoryRepository(session))
        self._reports = ReportService(session, ReportRepository(session))
        self._master = MasterDataService(MasterDataRepository(session))
        self._inventory = InventoryService(session, InventoryRepository(session))
        self._schedules = ScheduleService(session, ScheduleRepository(session))
        self._clock = clock

    def execute(
        self, plan: ChatQueryPlan, *, actor: AppUser, data_cutoff_at: datetime | None
    ) -> ChatQueryResult:
        if plan.tool == "clarify":
            clarification = validate_generated_markdown(plan.question or "")
            return ChatQueryResult(
                tool="clarify",
                data={"status": "clarification"},
                scope={"tool": "clarify"},
                clarification=clarification,
            )
        if plan.tool == "stock_status":
            return self._stock_status(self._arguments(StockStatusArguments, plan))
        today = self._clock().astimezone(SEOUL).date()
        if plan.tool == "quality_summary":
            quality_arguments = self._arguments(QualitySummaryArguments, plan)
            date_from, date_to = _period(quality_arguments.days, today)
            return self._quality_summary(quality_arguments, date_from, date_to, data_cutoff_at)
        if plan.tool == "inspection_records":
            inspection_arguments = self._arguments(InspectionRecordsArguments, plan)
            date_from, date_to = _period(inspection_arguments.days, today)
            return self._inspection_records(
                inspection_arguments, date_from, date_to, data_cutoff_at
            )
        if plan.tool == "process_records":
            process_arguments = self._arguments(ProcessRecordsArguments, plan)
            date_from, date_to = _period(process_arguments.days, today)
            return self._process_records(process_arguments, date_from, date_to, data_cutoff_at)
        if plan.tool == "stock_movements":
            movement_arguments = self._arguments(StockMovementsArguments, plan)
            date_from, date_to = _period(movement_arguments.days, today)
            return self._stock_movements(movement_arguments, date_from, date_to)
        if plan.tool == "schedule_list":
            schedule_arguments = self._arguments(ScheduleListArguments, plan)
            date_from, date_to = _period(schedule_arguments.days, today)
            return self._schedule_list(schedule_arguments, date_from, date_to)
        report_arguments = self._arguments(ReportSearchArguments, plan)
        date_from, date_to = _period(report_arguments.days, today)
        return self._report_search(
            report_arguments,
            actor,
            date_from,
            date_to,
            data_cutoff_at,
        )

    def _arguments(self, model: type[_ArgumentsT], plan: ChatQueryPlan) -> _ArgumentsT:
        try:
            return model.model_validate(plan.arguments)
        except ValidationError as error:
            raise ChatPlanError("tool arguments are out of bounds") from error

    def _quality_summary(
        self,
        arguments: QualitySummaryArguments,
        date_from: date,
        date_to: date,
        data_cutoff_at: datetime | None,
    ) -> ChatQueryResult:
        product, product_note = self._resolve_product(arguments.product)
        equipment, equipment_note = self._resolve_equipment(arguments.equipment)
        scope = self._scope(
            "quality_summary",
            date_from,
            date_to,
            product,
            equipment,
            data_cutoff_at,
        )
        unresolved = product_note or equipment_note
        if unresolved is not None:
            return ChatQueryResult(
                tool="quality_summary",
                data={"status": unresolved["status"], **unresolved},
                scope=scope,
            )
        summary = self._quality.get_summary(
            equipment_id=equipment.id if equipment else None,
            product_id=product.id if product else None,
            date_from=date_from,
            date_to=date_to,
            data_cutoff_at=data_cutoff_at,
        )
        data: dict[str, object] = {
            "status": "ok",
            "period": scope["period"],
            "target": scope["target"],
            "inspected_count": summary.inspected_count,
            "good_count": summary.good_count,
            "defect_count": summary.defect_count,
            "defect_rate_percent": (
                str(summary.defect_rate) if summary.defect_rate is not None else None
            ),
            "defect_types": [
                {"type": defect_type or "미분류", "count": count}
                for defect_type, count in summary.defect_types
            ],
            "production_record_count": summary.production_record_count,
            "includes_demo": summary.includes_demo,
            "data_cutoff_at": scope["data_cutoff_at"],
        }
        evidence = [EvidenceSource(product_id=product.id)] if product is not None else []
        return ChatQueryResult(
            tool="quality_summary",
            data=data,
            scope=scope,
            evidence=evidence,
            is_demo=summary.includes_demo,
        )

    def _inspection_records(
        self,
        arguments: InspectionRecordsArguments,
        date_from: date,
        date_to: date,
        data_cutoff_at: datetime | None,
    ) -> ChatQueryResult:
        product, product_note = self._resolve_product(arguments.product)
        equipment, equipment_note = self._resolve_equipment(arguments.equipment)
        scope = self._scope(
            "inspection_records",
            date_from,
            date_to,
            product,
            equipment,
            data_cutoff_at,
            extra={"verdict": arguments.verdict},
        )
        unresolved = product_note or equipment_note
        if unresolved is not None:
            return ChatQueryResult(
                tool="inspection_records",
                data={"status": unresolved["status"], **unresolved},
                scope=scope,
            )
        page = self._records.list_inspection_records(
            equipment_id=equipment.id if equipment else None,
            product_id=product.id if product else None,
            verdict=arguments.verdict,
            date_from=date_from,
            date_to=date_to,
            page=1,
            page_size=arguments.limit,
            data_cutoff_at=data_cutoff_at,
        )
        items = [
            {
                "record_id": view.record.id,
                "inspected_at": view.record.inspected_at.isoformat(),
                "product": view.product.name if view.product else None,
                "equipment": view.equipment.equipment_code,
                "verdict": view.record.verdict,
                "defect_type": view.record.defect_type,
                "is_demo": view.record.is_demo,
            }
            for view in page.records
        ]
        evidence = [
            EvidenceSource(
                inspection_record_id=view.record.id,
                source_time=view.record.inspected_at,
            )
            for view in page.records
        ]
        data: dict[str, object] = {
            "status": "ok",
            "period": scope["period"],
            "target": scope["target"],
            "verdict": arguments.verdict,
            "total_count": page.total_items,
            "returned_count": len(items),
            "items": items,
            "data_cutoff_at": scope["data_cutoff_at"],
        }
        return ChatQueryResult(
            tool="inspection_records",
            data=data,
            scope=scope,
            evidence=evidence,
            is_demo=any(view.record.is_demo for view in page.records),
        )

    def _process_records(
        self,
        arguments: ProcessRecordsArguments,
        date_from: date,
        date_to: date,
        data_cutoff_at: datetime | None,
    ) -> ChatQueryResult:
        product, product_note = self._resolve_product(arguments.product)
        equipment, equipment_note = self._resolve_equipment(arguments.equipment)
        scope = self._scope(
            "process_records",
            date_from,
            date_to,
            product,
            equipment,
            data_cutoff_at,
        )
        unresolved = product_note or equipment_note
        if unresolved is not None:
            return ChatQueryResult(
                tool="process_records",
                data={"status": unresolved["status"], **unresolved},
                scope=scope,
            )
        page = self._records.list_process_records(
            equipment_id=equipment.id if equipment else None,
            product_id=product.id if product else None,
            date_from=date_from,
            date_to=date_to,
            page=1,
            page_size=arguments.limit,
            data_cutoff_at=data_cutoff_at,
        )
        items = [
            {
                "record_id": view.record.id,
                "occurred_at": view.record.occurred_at.isoformat(),
                "product": view.product.name if view.product else None,
                "equipment": view.equipment.equipment_code,
                "cycle_time_seconds": (
                    str(view.record.cycle_time_seconds)
                    if view.record.cycle_time_seconds is not None
                    else None
                ),
                "is_demo": view.record.is_demo,
            }
            for view in page.records
        ]
        evidence = [
            EvidenceSource(
                process_record_id=view.record.id,
                source_time=view.record.occurred_at,
            )
            for view in page.records
        ]
        data: dict[str, object] = {
            "status": "ok",
            "period": scope["period"],
            "target": scope["target"],
            "total_count": page.total_items,
            "returned_count": len(items),
            "items": items,
            "data_cutoff_at": scope["data_cutoff_at"],
        }
        return ChatQueryResult(
            tool="process_records",
            data=data,
            scope=scope,
            evidence=evidence,
            is_demo=any(view.record.is_demo for view in page.records),
        )

    def _report_search(
        self,
        arguments: ReportSearchArguments,
        actor: AppUser,
        date_from: date,
        date_to: date,
        data_cutoff_at: datetime | None,
    ) -> ChatQueryResult:
        scope = self._scope(
            "report_search",
            date_from,
            date_to,
            None,
            None,
            data_cutoff_at,
            extra={"query": arguments.query},
        )
        page = self._reports.list_reports(
            actor,
            query=arguments.query,
            category=None,
            business_status=None,
            date_from=date_from,
            date_to=date_to,
            page=1,
            page_size=arguments.limit,
        )
        items = [
            {
                "report_id": view.report.id,
                "title": view.report.title,
                "category": view.report.category,
                "business_status": view.report.business_status,
                "author": view.author_display_name,
                "created_at": view.report.created_at.isoformat(),
                "version": view.report.version,
            }
            for view in page.reports
        ]
        evidence = [
            EvidenceSource(
                report_id=view.report.id,
                source_version=view.report.version,
                source_time=view.report.created_at,
            )
            for view in page.reports
        ]
        data: dict[str, object] = {
            "status": "ok",
            "tool": "report_search",
            "period": scope["period"],
            "query": arguments.query,
            "total_count": page.total_items,
            "returned_count": len(items),
            "items": items,
            "data_cutoff_at": scope["data_cutoff_at"],
        }
        return ChatQueryResult(
            tool="report_search",
            data=data,
            scope=scope,
            evidence=evidence,
        )

    def _stock_status(self, arguments: StockStatusArguments) -> ChatQueryResult:
        product, product_note = self._resolve_product(arguments.product)
        target: dict[str, object] = {
            "product_id": product.id if product else None,
            "product_name": product.name if product else None,
        }
        scope: dict[str, object] = {
            "tool": "stock_status",
            "target": target,
            "low_stock": arguments.low_stock,
        }
        if product_note is not None:
            return ChatQueryResult(
                tool="stock_status",
                data={"status": product_note["status"], **product_note},
                scope=scope,
            )
        page = self._inventory.list_stocks(
            query=None if product is None else product.name,
            low_stock_only=arguments.low_stock,
            page=1,
            page_size=arguments.limit,
        )
        rows = [row for row in page.rows if product is None or row.product.id == product.id]
        items = [
            {
                "product_id": row.product.id,
                "product": row.product.name,
                "product_code": row.product.product_code,
                "quantity": row.quantity,
                "minimum_stock": row.product.minimum_stock,
                "is_low_stock": (
                    row.product.minimum_stock is not None
                    and row.quantity < row.product.minimum_stock
                ),
            }
            for row in rows
        ]
        data: dict[str, object] = {
            "status": "ok",
            "target": target,
            "low_stock": arguments.low_stock,
            "total_count": len(rows) if product is not None else page.total_items,
            "returned_count": len(items),
            "items": items,
        }
        evidence = [EvidenceSource(product_id=product.id)] if product is not None else []
        return ChatQueryResult(
            tool="stock_status",
            data=data,
            scope=scope,
            evidence=evidence,
        )

    def _stock_movements(
        self,
        arguments: StockMovementsArguments,
        date_from: date,
        date_to: date,
    ) -> ChatQueryResult:
        product, product_note = self._resolve_product(arguments.product)
        scope = self._scope(
            "stock_movements",
            date_from,
            date_to,
            product,
            None,
            None,
            extra={"kind": arguments.kind},
        )
        if product_note is not None:
            return ChatQueryResult(
                tool="stock_movements",
                data={"status": product_note["status"], **product_note},
                scope=scope,
            )
        page = self._inventory.list_movements(
            product_id=product.id if product else None,
            kind=arguments.kind,
            date_from=date_from,
            date_to=date_to,
            page=1,
            page_size=arguments.limit,
        )
        items = [
            {
                "movement_id": row.movement.id,
                "created_at": row.movement.created_at.isoformat(),
                "product": row.product_name,
                "product_code": row.product_code,
                "kind": row.movement.kind,
                "delta": row.movement.delta,
                "reason": row.movement.reason,
                "actor": row.actor_display_name,
                "is_checked": row.movement.checked_at is not None,
                "checked_at": (
                    row.movement.checked_at.isoformat()
                    if row.movement.checked_at is not None
                    else None
                ),
            }
            for row in page.rows
        ]
        data: dict[str, object] = {
            "status": "ok",
            "period": scope["period"],
            "target": scope["target"],
            "kind": arguments.kind,
            "total_count": page.total_items,
            "returned_count": len(items),
            "items": items,
        }
        evidence = [EvidenceSource(product_id=product.id)] if product is not None else []
        return ChatQueryResult(
            tool="stock_movements",
            data=data,
            scope=scope,
            evidence=evidence,
        )

    def _schedule_list(
        self,
        arguments: ScheduleListArguments,
        date_from: date,
        date_to: date,
    ) -> ChatQueryResult:
        scope: dict[str, object] = {
            "tool": "schedule_list",
            "period": {"from": date_from.isoformat(), "to": date_to.isoformat()},
        }
        page = self._schedules.list_schedules(
            date_from=date_from,
            date_to=date_to,
            page=1,
            page_size=arguments.limit,
        )
        items = [
            {
                "schedule_id": view.schedule.id,
                "title": view.schedule.title,
                "category": view.schedule.category,
                "description": view.schedule.description,
                "all_day": view.schedule.all_day,
                "start_date": (
                    view.schedule.start_date.isoformat()
                    if view.schedule.start_date is not None
                    else None
                ),
                "end_date_exclusive": (
                    view.schedule.end_date_exclusive.isoformat()
                    if view.schedule.end_date_exclusive is not None
                    else None
                ),
                "starts_at": (
                    view.schedule.starts_at.isoformat()
                    if view.schedule.starts_at is not None
                    else None
                ),
                "ends_at": (
                    view.schedule.ends_at.isoformat() if view.schedule.ends_at is not None else None
                ),
                "author": view.author_display_name,
            }
            for view in page.schedules
        ]
        data: dict[str, object] = {
            "status": "ok",
            "period": scope["period"],
            "total_count": page.total_items,
            "returned_count": len(items),
            "items": items,
        }
        return ChatQueryResult(tool="schedule_list", data=data, scope=scope)

    def _resolve_product(self, term: str | None) -> tuple[Product | None, dict[str, object] | None]:
        if term is None:
            return None, None
        normalized = term.casefold()
        candidates = self._master.list_products(query=term)
        exact = [
            item
            for item in candidates
            if item.name.casefold() == normalized
            or (item.product_code is not None and item.product_code.casefold() == normalized)
        ]
        if len(exact) == 1:
            return exact[0], None
        if len(candidates) == 1:
            return candidates[0], None
        if not candidates:
            return None, {"status": "not_found", "requested": term}
        return None, {
            "status": "ambiguous",
            "requested": term,
            "candidates": [item.name for item in candidates[:5]],
        }

    def _resolve_equipment(
        self, term: str | None
    ) -> tuple[Equipment | None, dict[str, object] | None]:
        if term is None:
            return None, None
        normalized = term.casefold()
        candidates = self._master.list_equipment(production_line_id=None)
        exact = [
            item
            for item in candidates
            if item.equipment_code.casefold() == normalized or item.name.casefold() == normalized
        ]
        if len(exact) == 1:
            return exact[0], None
        partial = [
            item
            for item in candidates
            if normalized in item.equipment_code.casefold() or normalized in item.name.casefold()
        ]
        if len(partial) == 1:
            return partial[0], None
        if not partial:
            return None, {"status": "not_found", "requested": term}
        return None, {
            "status": "ambiguous",
            "requested": term,
            "candidates": [item.equipment_code for item in partial[:5]],
        }

    def _scope(
        self,
        tool: str,
        date_from: date,
        date_to: date,
        product: Product | None,
        equipment: Equipment | None,
        data_cutoff_at: datetime | None,
        *,
        extra: dict[str, object] | None = None,
    ) -> dict[str, object]:
        scope: dict[str, object] = {
            "tool": tool,
            "period": {"from": date_from.isoformat(), "to": date_to.isoformat()},
            "target": {
                "product_id": product.id if product else None,
                "product_name": product.name if product else None,
                "equipment_id": equipment.id if equipment else None,
                "equipment_code": equipment.equipment_code if equipment else None,
            },
            "data_cutoff_at": (
                data_cutoff_at.astimezone(UTC).isoformat() if data_cutoff_at is not None else None
            ),
        }
        if extra:
            scope.update(extra)
        return scope
