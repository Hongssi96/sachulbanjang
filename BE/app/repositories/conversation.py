from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import ColumnElement, and_, func, or_, select
from sqlalchemy.orm import Session

from app.models.conversation import AnswerEvidence, ChatTurn, Conversation
from app.models.master import Product
from app.models.process import InspectionRecord, ProcessRecord
from app.models.report import Report
from app.models.report_job import GenerationJob

ACTIVE_JOB_STATES = ("accepted", "querying", "writing")


@dataclass(frozen=True)
class ConversationSummary:
    conversation: Conversation
    turn_count: int


@dataclass(frozen=True)
class TurnJobRow:
    turn: ChatTurn
    job: GenerationJob | None


@dataclass(frozen=True)
class ReportAccess:
    author_id: int
    deleted: bool


class ConversationRepository:
    """Owner-scoped data access for chat conversations and their turns."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def add_conversation(self, conversation: Conversation) -> None:
        self._session.add(conversation)
        self._session.flush()

    def add_turn(self, turn: ChatTurn) -> None:
        self._session.add(turn)
        self._session.flush()

    def add_evidence(self, evidence: AnswerEvidence) -> None:
        self._session.add(evidence)

    def find_conversation(self, conversation_id: int) -> Conversation | None:
        return self._session.scalar(
            select(Conversation).where(
                Conversation.id == conversation_id,
                Conversation.deleted_at.is_(None),
            )
        )

    def lock_owned_conversation(self, conversation_id: int, owner_id: int) -> Conversation | None:
        return self._session.scalar(
            select(Conversation)
            .where(
                Conversation.id == conversation_id,
                Conversation.owner_id == owner_id,
                Conversation.deleted_at.is_(None),
            )
            .with_for_update()
        )

    def _conditions(
        self,
        *,
        owner_id: int,
        is_admin: bool,
        query: str | None,
        period_from: datetime | None,
        period_to: datetime | None,
    ) -> list[ColumnElement[bool]]:
        conditions: list[ColumnElement[bool]] = [
            Conversation.owner_id == owner_id,
            Conversation.deleted_at.is_(None),
        ]
        if period_from is not None:
            conditions.append(Conversation.updated_at >= period_from)
        if period_to is not None:
            conditions.append(Conversation.updated_at < period_to)
        if query:
            escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            pattern = f"%{escaped}%"
            answer_match: ColumnElement[bool] = ChatTurn.answer.ilike(pattern, escape="\\")
            if not is_admin:
                hidden_answer = (
                    select(AnswerEvidence.id)
                    .join(Report, Report.id == AnswerEvidence.report_id)
                    .where(
                        AnswerEvidence.chat_turn_id == ChatTurn.id,
                        Report.author_id != owner_id,
                    )
                    .exists()
                )
                answer_match = and_(answer_match, ~hidden_answer)
            matching_turn = (
                select(ChatTurn.id)
                .where(
                    ChatTurn.conversation_id == Conversation.id,
                    or_(
                        ChatTurn.question.ilike(pattern, escape="\\"),
                        answer_match,
                    ),
                )
                .exists()
            )
            conditions.append(
                or_(
                    Conversation.title.ilike(pattern, escape="\\"),
                    matching_turn,
                )
            )
        return conditions

    def count_conversations(
        self,
        *,
        owner_id: int,
        is_admin: bool,
        query: str | None,
        period_from: datetime | None,
        period_to: datetime | None,
    ) -> int:
        conditions = self._conditions(
            owner_id=owner_id,
            is_admin=is_admin,
            query=query,
            period_from=period_from,
            period_to=period_to,
        )
        return (
            self._session.scalar(select(func.count()).select_from(Conversation).where(*conditions))
            or 0
        )

    def find_conversations(
        self,
        *,
        owner_id: int,
        is_admin: bool,
        query: str | None,
        period_from: datetime | None,
        period_to: datetime | None,
        offset: int,
        limit: int,
    ) -> list[ConversationSummary]:
        conditions = self._conditions(
            owner_id=owner_id,
            is_admin=is_admin,
            query=query,
            period_from=period_from,
            period_to=period_to,
        )
        turn_count = (
            select(func.count(ChatTurn.id))
            .where(ChatTurn.conversation_id == Conversation.id)
            .correlate(Conversation)
            .scalar_subquery()
        )
        rows = self._session.execute(
            select(Conversation, turn_count)
            .where(*conditions)
            .order_by(Conversation.updated_at.desc(), Conversation.id.desc())
            .offset(offset)
            .limit(limit)
        )
        return [
            ConversationSummary(conversation=conversation, turn_count=count)
            for conversation, count in rows
        ]

    def find_turns_with_jobs(self, conversation_id: int) -> list[TurnJobRow]:
        rows = self._session.execute(
            select(ChatTurn, GenerationJob)
            .outerjoin(GenerationJob, GenerationJob.id == ChatTurn.active_job_id)
            .where(ChatTurn.conversation_id == conversation_id)
            .order_by(ChatTurn.created_at.asc(), ChatTurn.id.asc())
        )
        return [TurnJobRow(turn=turn, job=job) for turn, job in rows]

    def find_turn(self, conversation_id: int, turn_id: int) -> ChatTurn | None:
        return self._session.scalar(
            select(ChatTurn).where(
                ChatTurn.id == turn_id,
                ChatTurn.conversation_id == conversation_id,
            )
        )

    def find_turn_by_active_job(self, job_id: int) -> ChatTurn | None:
        return self._session.scalar(select(ChatTurn).where(ChatTurn.active_job_id == job_id))

    def find_job(self, job_id: int | None) -> GenerationJob | None:
        if job_id is None:
            return None
        return self._session.get(GenerationJob, job_id)

    def find_active_job(self, conversation_id: int) -> GenerationJob | None:
        return self._session.scalar(
            select(GenerationJob)
            .join(ChatTurn, ChatTurn.active_job_id == GenerationJob.id)
            .where(
                ChatTurn.conversation_id == conversation_id,
                GenerationJob.state.in_(ACTIVE_JOB_STATES),
            )
            .order_by(GenerationJob.id.desc())
            .limit(1)
        )

    def list_evidence(self, turn_ids: list[int]) -> list[AnswerEvidence]:
        if not turn_ids:
            return []
        return list(
            self._session.scalars(
                select(AnswerEvidence)
                .where(AnswerEvidence.chat_turn_id.in_(turn_ids))
                .order_by(AnswerEvidence.id.asc())
            )
        )

    def find_report_access(self, report_ids: list[int]) -> dict[int, ReportAccess]:
        if not report_ids:
            return {}
        rows = self._session.execute(
            select(Report.id, Report.author_id, Report.deleted_at).where(Report.id.in_(report_ids))
        )
        return {
            report_id: ReportAccess(author_id=author_id, deleted=deleted_at is not None)
            for report_id, author_id, deleted_at in rows
        }

    def find_deleted_source_ids(
        self,
        *,
        process_record_ids: list[int],
        inspection_record_ids: list[int],
        product_ids: list[int],
    ) -> tuple[set[int], set[int], set[int]]:
        process_deleted: set[int] = set()
        if process_record_ids:
            process_deleted = set(
                self._session.scalars(
                    select(ProcessRecord.id).where(
                        ProcessRecord.id.in_(process_record_ids),
                        ProcessRecord.deleted_at.is_not(None),
                    )
                )
            )
        inspection_deleted: set[int] = set()
        if inspection_record_ids:
            inspection_deleted = set(
                self._session.scalars(
                    select(InspectionRecord.id).where(
                        InspectionRecord.id.in_(inspection_record_ids),
                        InspectionRecord.deleted_at.is_not(None),
                    )
                )
            )
        product_deleted: set[int] = set()
        if product_ids:
            product_deleted = set(
                self._session.scalars(
                    select(Product.id).where(
                        Product.id.in_(product_ids),
                        Product.deleted_at.is_not(None),
                    )
                )
            )
        return process_deleted, inspection_deleted, product_deleted
