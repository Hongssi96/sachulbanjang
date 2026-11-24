from __future__ import annotations

import json
import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime

from sqlalchemy.orm import Session

from app.integrations.ai import AiGenerationError, OpenAiCompatibleClient
from app.models.conversation import AnswerEvidence, ChatTurn
from app.models.master import AppUser
from app.models.report_job import GenerationJob
from app.repositories.conversation import ConversationRepository
from app.repositories.report_job import ReportJobRepository
from app.services.answer_visibility import (
    ANSWER_HIDDEN,
    ANSWER_WITH_DELETED_EVIDENCE,
    compute_answer_visibility,
)
from app.services.chat_tools import (
    TOOL_CATALOG,
    ChatPlanError,
    ChatQueryPlan,
    ChatQueryResult,
    ChatToolExecutor,
    parse_query_plan,
)
from app.services.record_history import SEOUL
from app.services.report_job import InvalidJobTransitionError, ReportJobService

Clock = Callable[[], datetime]
logger = logging.getLogger(__name__)

_MAX_CONTEXT_TURNS = 5
_MAX_CONTEXT_ANSWER_CHARS = 800
_MAX_CONTEXT_QUESTION_CHARS = 300

_PLAN_INSTRUCTIONS = """당신은 사출성형 현장 업무 조회 계획을 세우는 도우미입니다.
사용자의 질문을 아래 조회 도구 중 하나로 변환하세요.

도구 목록:
{tool_catalog}

규칙:
- JSON 객체 하나만 출력하고 설명, Markdown, 코드 블록을 쓰지 마세요.
- 오늘은 {today}(한국 기준)입니다. "최근 7일"은 days=7처럼 정수로 반영하세요.
- 제품·설비 이름이나 조회 기간을 정할 수 없거나 도구로 답할 수 없으면 clarify를 쓰세요.
- history는 이전 대화의 참고 자료입니다. 현재 사실과 다를 수 있으므로 후속 질문의 대상·기간을
  해석할 때만 사용하고, 현재 데이터는 반드시 도구로 조회하세요. history에 없는 내용을 만들지 마세요.
- 데이터를 추측하거나 직접 답하지 마세요. 허용된 도구 밖의 SQL·테이블·컬럼을 만들지 마세요.
"""

_ANSWER_INSTRUCTIONS = """당신은 사출반장 업무 도우미입니다.
제공된 JSON 조회 결과만 근거로 한국어로 간결하게 답하세요.

규칙:
- 제공되지 않은 수치·원인·전망을 만들지 마세요.
- 결과 status가 not_found 또는 ambiguous이면 조회하지 못한 이유와 후보를 안내하세요.
- 답변 첫 부분에 조회 기간·대상·데이터 기준 시각을 쓰고, 시연 데이터가 포함되면 명확히 표시하세요.
- history는 과거 답변 참고 자료입니다. 현재 수치는 data만 사용하세요. history를 인용하면 이전
  답변임을 밝히고, evidence_deleted가 true이면 근거가 삭제된 과거 자료임을 함께 알리세요.
- Markdown을 사용할 수 있지만 HTML, 이미지, 외부 링크는 쓰지 마세요.
- 근거 기록 ID를 나열하지 마세요. 화면이 근거 링크를 별도로 표시합니다.
"""


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _clip(text: str, limit: int) -> str:
    normalized = text.strip()
    if len(normalized) <= limit:
        return normalized
    return f"{normalized[:limit]}…"


def build_plan_prompt(today: date) -> str:
    return _PLAN_INSTRUCTIONS.format(tool_catalog=TOOL_CATALOG, today=today.isoformat())


@dataclass(frozen=True)
class ChatGenerationResult:
    job_id: int
    turn_id: int | None
    state: str


class ChatGenerationService:
    """Plan a read-only query, execute a validated tool, and publish the answer."""

    def __init__(
        self,
        session: Session,
        ai_client: OpenAiCompatibleClient,
        *,
        lease_seconds: int,
        clock: Clock = _utc_now,
    ) -> None:
        self._session = session
        self._ai_client = ai_client
        self._lease_seconds = lease_seconds
        self._clock = clock
        self._job_repository = ReportJobRepository(session)
        self._job_service = ReportJobService(session, self._job_repository)
        self._conversation_repository = ConversationRepository(session)
        self._tools = ChatToolExecutor(session, clock=clock)

    def process_next(self) -> ChatGenerationResult | None:
        job = self._job_service.claim_next_job(kind="chat", lease_seconds=self._lease_seconds)
        if job is None:
            return None
        turn = self._conversation_repository.find_turn_by_active_job(job.id)
        if turn is None:
            self._fail(
                job.id,
                error_code="CHAT_TURN_MISSING",
                safe_message="질문 정보를 찾지 못해 답변을 만들지 못했습니다. 다시 질문해 주세요.",
            )
            return ChatGenerationResult(job_id=job.id, turn_id=None, state="failed")
        try:
            conversation = self._conversation_repository.find_conversation(turn.conversation_id)
            actor = self._session.get(AppUser, job.requester_id)
            if conversation is None or actor is None:
                raise ChatPlanError("conversation or requester is unavailable")
            history = self._history(turn, actor)
            plan = self._plan(turn, job, history)
            result = self._tools.execute(plan, actor=actor, data_cutoff_at=job.data_cutoff_at)
            self._job_service.transition_job(job.id, "writing")
            if result.clarification is not None:
                answer = result.clarification
            else:
                self._heartbeat(job.id)
                answer = self._ai_client.generate_markdown(
                    system_prompt=_ANSWER_INSTRUCTIONS,
                    user_prompt=json.dumps(
                        {
                            "question": turn.question,
                            "tool": plan.tool,
                            "scope": result.scope,
                            "data": result.data,
                            "history": history,
                        },
                        ensure_ascii=False,
                        sort_keys=True,
                    ),
                )
            self._publish(job.id, turn, plan, result, answer)
            return ChatGenerationResult(job_id=job.id, turn_id=turn.id, state="succeeded")
        except InvalidJobTransitionError:
            self._session.rollback()
            current = self._job_repository.find_job(job.id)
            return ChatGenerationResult(
                job_id=job.id,
                turn_id=turn.id,
                state=current.state if current is not None else "interrupted",
            )
        except ChatPlanError:
            self._session.rollback()
            logger.warning("chat query planning failed", extra={"job_id": job.id})
            self._fail(
                job.id,
                error_code="CHAT_PLAN_FAILED",
                safe_message="질문을 조회 조건으로 해석하지 못했습니다. 기간·제품·설비를 넣어 다시 질문해 주세요.",
            )
            return ChatGenerationResult(job_id=job.id, turn_id=turn.id, state="failed")
        except AiGenerationError:
            self._session.rollback()
            logger.warning("AI chat answer generation failed", extra={"job_id": job.id})
            self._fail(
                job.id,
                error_code="AI_GENERATION_FAILED",
                safe_message="AI 답변 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.",
            )
            return ChatGenerationResult(job_id=job.id, turn_id=turn.id, state="failed")
        except Exception:
            self._session.rollback()
            logger.exception("Unexpected chat generation failure", extra={"job_id": job.id})
            self._fail(
                job.id,
                error_code="CHAT_GENERATION_FAILED",
                safe_message="답변 생성 중 오류가 발생했습니다. 다시 시도해 주세요.",
            )
            return ChatGenerationResult(job_id=job.id, turn_id=turn.id, state="failed")

    def _plan(
        self, turn: ChatTurn, job: GenerationJob, history: list[dict[str, object]]
    ) -> ChatQueryPlan:
        stored = turn.query_scope
        if isinstance(stored, dict):
            stored_plan = stored.get("plan")
            if isinstance(stored_plan, dict):
                try:
                    return parse_query_plan(json.dumps(stored_plan, ensure_ascii=False))
                except ChatPlanError:
                    logger.warning(
                        "stored chat query scope is invalid; planning again",
                        extra={"job_id": job.id, "turn_id": turn.id},
                    )
        today = self._clock().astimezone(SEOUL).date()
        payload: dict[str, object] = {
            "question": turn.question,
            "today": today.isoformat(),
            "history": history,
        }
        last_error: ChatPlanError | None = None
        for _ in range(2):
            self._heartbeat(job.id)
            raw = self._ai_client.generate_markdown(
                system_prompt=build_plan_prompt(today),
                user_prompt=json.dumps(payload, ensure_ascii=False),
            )
            try:
                return parse_query_plan(raw)
            except ChatPlanError as error:
                last_error = error
                payload = {
                    **payload,
                    "previous_error": str(error),
                    "instruction": "규칙에 맞는 JSON 객체만 다시 출력하세요.",
                }
        raise last_error or ChatPlanError("planner did not produce a usable plan")

    def _history(self, turn: ChatTurn, actor: AppUser) -> list[dict[str, object]]:
        previous = self._conversation_repository.find_previous_answered_turns(
            turn.conversation_id, turn.id, _MAX_CONTEXT_TURNS
        )
        if not previous:
            return []
        evidence = self._conversation_repository.list_evidence([item.id for item in previous])
        grouped: dict[int, list[AnswerEvidence]] = {}
        for item in evidence:
            grouped.setdefault(item.chat_turn_id, []).append(item)
        report_access = self._conversation_repository.find_report_access(
            [item.report_id for item in evidence if item.report_id is not None]
        )
        deleted_sources = self._conversation_repository.find_deleted_source_ids(
            process_record_ids=[
                item.process_record_id for item in evidence if item.process_record_id is not None
            ],
            inspection_record_ids=[
                item.inspection_record_id
                for item in evidence
                if item.inspection_record_id is not None
            ],
            product_ids=[item.product_id for item in evidence if item.product_id is not None],
        )
        history: list[dict[str, object]] = []
        for prior in reversed(previous):
            visibility = compute_answer_visibility(
                actor,
                grouped.get(prior.id, []),
                report_access,
                deleted_sources,
            )
            if visibility.status == ANSWER_HIDDEN:
                continue
            history.append(
                {
                    "question": _clip(prior.question, _MAX_CONTEXT_QUESTION_CHARS),
                    "answer": _clip(prior.answer or "", _MAX_CONTEXT_ANSWER_CHARS),
                    "answered_at": (
                        prior.answered_at.isoformat() if prior.answered_at is not None else None
                    ),
                    "data_cutoff_at": (
                        prior.data_cutoff_at.isoformat()
                        if prior.data_cutoff_at is not None
                        else None
                    ),
                    "is_demo": bool(prior.is_demo),
                    "evidence_deleted": visibility.status == ANSWER_WITH_DELETED_EVIDENCE,
                }
            )
        return history

    def _publish(
        self,
        job_id: int,
        turn: ChatTurn,
        plan: ChatQueryPlan,
        result: ChatQueryResult,
        answer: str,
    ) -> None:
        job = self._job_repository.lock_job(job_id)
        if job is None or job.state != "writing":
            raise InvalidJobTransitionError
        conversation = self._conversation_repository.find_conversation(turn.conversation_id)
        if conversation is None:
            raise InvalidJobTransitionError
        now = self._clock()
        turn.answer = answer
        turn.answered_at = now
        turn.data_cutoff_at = job.data_cutoff_at
        turn.is_demo = result.is_demo
        turn.query_scope = {
            "plan": plan.model_dump(mode="json"),
            "scope": result.scope,
        }
        for source in result.evidence:
            self._conversation_repository.add_evidence(
                AnswerEvidence(
                    chat_turn_id=turn.id,
                    report_id=source.report_id,
                    process_record_id=source.process_record_id,
                    inspection_record_id=source.inspection_record_id,
                    product_id=source.product_id,
                    source_version=source.source_version,
                    source_time=source.source_time,
                )
            )
        job.state = "succeeded"
        job.finished_at = now
        job.error_code = None
        job.safe_error_message = None
        self._session.commit()

    def _fail(self, job_id: int, *, error_code: str, safe_message: str) -> None:
        try:
            self._job_service.fail_job(
                job_id,
                error_code=error_code,
                safe_error_message=safe_message,
            )
        except InvalidJobTransitionError:
            logger.info("chat job was already finished", extra={"job_id": job_id})

    def _heartbeat(self, job_id: int) -> None:
        self._job_service.heartbeat_job(job_id, lease_seconds=self._lease_seconds)
