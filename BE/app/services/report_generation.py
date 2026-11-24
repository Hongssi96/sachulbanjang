from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy.orm import Session

from app.core.datetime_labels import korean_kst_label
from app.integrations.ai import AiGenerationError, OpenAiCompatibleClient
from app.models.report import Report, ReportRevision
from app.models.report_job import GenerationJob
from app.repositories.report import ReportRepository
from app.repositories.report_generation import ReportGenerationRepository
from app.repositories.report_job import ReportJobRepository
from app.services.record_history import period_bounds
from app.services.report_job import InvalidJobTransitionError, ReportJobService

_SYSTEM_PROMPT = """당신은 사출성형 업무 보고서를 작성하는 도우미입니다.
제공된 JSON 집계만 근거로 한국어 Markdown 본문을 작성하세요.
사실을 추측하거나 원인을 단정하지 마세요. 개인 식별 정보는 작성하지 마세요.
반드시 '집계 기준', '생산·품질 요약', '주요 확인 사항' 제목을 포함하세요.
'집계 기준'에는 JSON의 data_cutoff_label을 그대로 쓰고 ISO·UTC 원문을 쓰지 마세요.
기록이 없으면 미가동으로 단정하지 말고 '조회된 기록 없음'이라고 쓰세요.
시연 데이터가 포함되면 본문 첫 부분에 명확히 표시하세요.
제목은 출력하지 말고 Markdown 본문만 출력하세요."""

_KIND_LABELS = {"general": "일반", "weekly": "주간", "monthly": "월간"}
_RATE_QUANTUM = Decimal("0.01")
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class GenerationResult:
    job_id: int
    report_id: int | None
    state: str


class ReportGenerationService:
    """Aggregate source data, call AI, and atomically publish a report."""

    def __init__(
        self,
        session: Session,
        ai_client: OpenAiCompatibleClient,
        *,
        lease_seconds: int,
    ) -> None:
        self._session = session
        self._ai_client = ai_client
        self._lease_seconds = lease_seconds
        self._job_repository = ReportJobRepository(session)
        self._job_service = ReportJobService(session, self._job_repository)
        self._generation_repository = ReportGenerationRepository(session)
        self._report_repository = ReportRepository(session)

    def process_next(self) -> GenerationResult | None:
        job = self._job_service.claim_next_job(kind="report", lease_seconds=self._lease_seconds)
        if job is None:
            return None
        try:
            snapshot = self._build_snapshot(job)
            self._job_service.transition_job(job.id, "writing")
            markdown = self._ai_client.generate_markdown(
                system_prompt=_SYSTEM_PROMPT,
                user_prompt=json.dumps(snapshot, ensure_ascii=False, sort_keys=True),
            )
            report_id = self._publish(job.id, snapshot=snapshot, markdown=markdown)
            return GenerationResult(job_id=job.id, report_id=report_id, state="succeeded")
        except InvalidJobTransitionError:
            self._session.rollback()
            current = self._job_repository.find_job(job.id)
            return GenerationResult(
                job_id=job.id,
                report_id=None,
                state=current.state if current is not None else "interrupted",
            )
        except AiGenerationError:
            self._session.rollback()
            logger.warning("AI report generation failed", extra={"job_id": job.id})
            self._fail_if_active(
                job.id,
                error_code="AI_GENERATION_FAILED",
                safe_message="AI 보고서 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.",
            )
            return GenerationResult(job_id=job.id, report_id=None, state="failed")
        except Exception:
            self._session.rollback()
            logger.exception("Unexpected report generation failure", extra={"job_id": job.id})
            self._fail_if_active(
                job.id,
                error_code="REPORT_GENERATION_FAILED",
                safe_message="보고서 생성 중 오류가 발생했습니다. 다시 시도해 주세요.",
            )
            return GenerationResult(job_id=job.id, report_id=None, state="failed")

    def _build_snapshot(self, job: GenerationJob) -> dict[str, object]:
        payload = job.request_payload
        period = payload.get("period")
        targets = payload.get("targets")
        if not isinstance(period, dict) or not isinstance(targets, dict):
            raise ValueError("invalid stored report job payload")

        date_from = _optional_date(period.get("from"))
        date_to = _optional_date(period.get("to"))
        period_from, period_to = period_bounds(date_from, date_to)
        department_ids = _integer_list(targets.get("department_ids"))
        production_line_ids = _integer_list(targets.get("production_line_ids"))
        requested_equipment_ids = _integer_list(targets.get("equipment_ids"))
        equipment_ids = self._generation_repository.resolve_equipment_ids(
            department_ids=department_ids,
            production_line_ids=production_line_ids,
            equipment_ids=requested_equipment_ids,
        )
        cutoff = job.data_cutoff_at or job.accepted_at
        totals = self._generation_repository.totals(
            equipment_ids=equipment_ids,
            period_from=period_from,
            period_to=period_to,
            data_cutoff_at=cutoff,
        )
        defect_types = self._generation_repository.defect_type_counts(
            equipment_ids=equipment_ids,
            period_from=period_from,
            period_to=period_to,
            data_cutoff_at=cutoff,
        )
        denominator = totals.good_count + totals.defect_count
        defect_rate = None
        if denominator:
            defect_rate = str(
                (Decimal(totals.defect_count) * Decimal(100) / Decimal(denominator)).quantize(
                    _RATE_QUANTUM, rounding=ROUND_HALF_UP
                )
            )
        return {
            "schema_version": 1,
            "report_kind": payload.get("report_kind"),
            "category": payload.get("category"),
            "period": {"from": period.get("from"), "to": period.get("to")},
            "data_cutoff_at": cutoff.astimezone(UTC).isoformat(),
            "data_cutoff_label": korean_kst_label(cutoff),
            "requested_targets": {
                "department_ids": department_ids,
                "production_line_ids": production_line_ids,
                "equipment_ids": requested_equipment_ids,
            },
            "resolved_equipment": self._generation_repository.equipment_labels(equipment_ids),
            "summary": {
                "production_record_count": totals.production_record_count,
                "inspected_count": totals.inspected_count,
                "good_count": totals.good_count,
                "defect_count": totals.defect_count,
                "defect_rate_percent": defect_rate,
                "defect_types": [
                    {"type": defect_type or "미분류", "count": count}
                    for defect_type, count in defect_types
                ],
                "includes_demo": totals.includes_demo,
            },
        }

    def _publish(self, job_id: int, *, snapshot: dict[str, object], markdown: str) -> int:
        job = self._job_repository.lock_job(job_id)
        if job is None or job.state != "writing":
            raise InvalidJobTransitionError
        existing = self._job_repository.find_job_with_report(job_id)
        if existing is not None and existing[1] is not None:
            raise InvalidJobTransitionError
        report_kind = str(job.request_payload["report_kind"])
        report = Report(
            author_id=job.requester_id,
            title=_report_title(report_kind, snapshot),
            body_markdown=markdown,
            category=str(job.request_payload["category"]),
            report_kind=report_kind,
            business_status="pending",
            version=1,
            generation_job_id=job.id,
            generation_data_cutoff_at=job.data_cutoff_at,
            generation_snapshot=snapshot,
        )
        self._report_repository.add_report(report)
        self._report_repository.add_revision(
            ReportRevision(
                report_id=report.id,
                version=1,
                title=report.title,
                body_markdown=report.body_markdown,
                editor_id=job.requester_id,
                created_at=datetime.now(UTC),
            )
        )
        job.state = "succeeded"
        job.finished_at = datetime.now(UTC)
        job.error_code = None
        job.safe_error_message = None
        self._session.commit()
        return report.id

    def _fail_if_active(self, job_id: int, *, error_code: str, safe_message: str) -> None:
        job = self._job_repository.find_job(job_id)
        if job is None or job.state in ("succeeded", "failed", "interrupted", "cancelled"):
            return
        self._job_service.fail_job(
            job_id,
            error_code=error_code,
            safe_error_message=safe_message,
        )


def _optional_date(value: object) -> date | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("invalid report period")
    return date.fromisoformat(value)


def _integer_list(value: object) -> list[int]:
    if not isinstance(value, list) or not all(isinstance(item, int) for item in value):
        raise ValueError("invalid report targets")
    return value


def _report_title(report_kind: str, snapshot: dict[str, object]) -> str:
    period = snapshot["period"]
    if not isinstance(period, dict):
        raise ValueError("invalid generation snapshot")
    date_from = period.get("from")
    date_to = period.get("to")
    if date_from and date_to:
        period_label = f"{date_from}~{date_to}"
    elif date_from:
        period_label = f"{date_from} 이후"
    elif date_to:
        period_label = f"{date_to}까지"
    else:
        period_label = "전체 기간"
    return f"{period_label} {_KIND_LABELS.get(report_kind, '업무')} 보고서"
