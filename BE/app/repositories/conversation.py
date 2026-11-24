from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.orm import Session

from app.models.conversation import AnswerEvidence, ChatTurn, Conversation
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
            matching_turn = (
                select(ChatTurn.id)
                .where(
                    ChatTurn.conversation_id == Conversation.id,
                    or_(
                        ChatTurn.question.ilike(pattern, escape="\\"),
                        ChatTurn.answer.ilike(pattern, escape="\\"),
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
        query: str | None,
        period_from: datetime | None,
        period_to: datetime | None,
    ) -> int:
        conditions = self._conditions(
            owner_id=owner_id,
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
        query: str | None,
        period_from: datetime | None,
        period_to: datetime | None,
        offset: int,
        limit: int,
    ) -> list[ConversationSummary]:
        conditions = self._conditions(
            owner_id=owner_id,
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
