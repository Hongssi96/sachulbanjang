from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime

from sqlalchemy.orm import Session

from app.models.conversation import AnswerEvidence, ChatTurn, Conversation
from app.models.master import AppUser
from app.models.report_job import GenerationJob
from app.repositories.conversation import ConversationRepository, ConversationSummary
from app.services.record_history import period_bounds
from app.services.report_job import (
    JobNotCancellableError,
    ReportJobService,
    RequestKeyConflictError,
    request_digest,
)

Clock = Callable[[], datetime]


def _utc_now() -> datetime:
    return datetime.now(UTC)


class ConversationError(Exception):
    """Base exception for rejected conversation operations."""


class ConversationNotFoundError(ConversationError):
    """Raised when a conversation does not exist or belongs to another user."""


class ChatTurnNotFoundError(ConversationError):
    """Raised when a turn does not exist in the given conversation."""


class ChatTurnInProgressError(ConversationError):
    """Raised when a new question is sent while an answer is still being generated."""


class ChatTurnNotRetryableError(ConversationError):
    """Raised when the latest job for a turn did not fail or get interrupted."""


@dataclass(frozen=True)
class ConversationPage:
    conversations: list[ConversationSummary]
    total_items: int


@dataclass(frozen=True)
class TurnView:
    turn: ChatTurn
    job: GenerationJob | None
    evidence: list[AnswerEvidence]


@dataclass(frozen=True)
class ConversationView:
    conversation: Conversation
    turns: list[TurnView]


def _turn_payload(
    conversation_id: int, question: str, refresh_of_turn_id: int | None
) -> dict[str, object]:
    return {
        "conversation_id": conversation_id,
        "question": question,
        "refresh_of_turn_id": refresh_of_turn_id,
    }


def _retry_payload(conversation_id: int, question: str, turn_id: int) -> dict[str, object]:
    return {
        "conversation_id": conversation_id,
        "question": question,
        "retry_of_turn_id": turn_id,
    }


class ConversationService:
    """Own the caller's conversation history and its queued chat jobs.

    Answer generation itself runs in the chat worker. This service stores the
    question, accepts the generation job, and exposes the current job state so
    the screen can show querying/writing progress and failures.
    """

    def __init__(
        self,
        session: Session,
        repository: ConversationRepository,
        jobs: ReportJobService,
        clock: Clock = _utc_now,
    ) -> None:
        self._session = session
        self._repository = repository
        self._jobs = jobs
        self._clock = clock

    def create_conversation(self, owner: AppUser, *, title: str) -> Conversation:
        conversation = Conversation(owner_id=owner.id, title=title)
        self._repository.add_conversation(conversation)
        self._session.commit()
        return conversation

    def list_conversations(
        self,
        owner: AppUser,
        *,
        query: str | None,
        date_from: date | None,
        date_to: date | None,
        page: int,
        page_size: int,
    ) -> ConversationPage:
        normalized = query.strip() if query is not None else ""
        period_from, period_to = period_bounds(date_from, date_to)
        total_items = self._repository.count_conversations(
            owner_id=owner.id,
            query=normalized or None,
            period_from=period_from,
            period_to=period_to,
        )
        conversations = self._repository.find_conversations(
            owner_id=owner.id,
            query=normalized or None,
            period_from=period_from,
            period_to=period_to,
            offset=(page - 1) * page_size,
            limit=page_size,
        )
        return ConversationPage(conversations=conversations, total_items=total_items)

    def get_conversation(self, owner: AppUser, conversation_id: int) -> ConversationView:
        conversation = self._repository.find_conversation(conversation_id)
        if conversation is None or conversation.owner_id != owner.id:
            raise ConversationNotFoundError
        rows = self._repository.find_turns_with_jobs(conversation_id)
        grouped: dict[int, list[AnswerEvidence]] = {}
        for evidence in self._repository.list_evidence([row.turn.id for row in rows]):
            grouped.setdefault(evidence.chat_turn_id, []).append(evidence)
        return ConversationView(
            conversation=conversation,
            turns=[
                TurnView(
                    turn=row.turn,
                    job=row.job,
                    evidence=grouped.get(row.turn.id, []),
                )
                for row in rows
            ],
        )

    def delete_conversation(self, owner: AppUser, conversation_id: int) -> None:
        conversation = self._repository.lock_owned_conversation(conversation_id, owner.id)
        if conversation is None:
            raise ConversationNotFoundError
        conversation.deleted_at = self._clock()
        active_job = self._repository.find_active_job(conversation_id)
        if active_job is None:
            self._session.commit()
            return
        try:
            self._jobs.cancel_job(owner, active_job.id)
        except JobNotCancellableError:
            self._session.commit()

    def submit_turn(
        self,
        owner: AppUser,
        conversation_id: int,
        *,
        question: str,
        client_request_key: str,
    ) -> tuple[ChatTurn, GenerationJob]:
        conversation = self._repository.lock_owned_conversation(conversation_id, owner.id)
        if conversation is None:
            raise ConversationNotFoundError
        payload = _turn_payload(conversation_id, question, None)
        existing = self._jobs.find_request(
            owner, kind="chat", client_request_key=client_request_key
        )
        if existing is not None:
            return self._reuse_turn(conversation_id, existing, payload)
        if self._repository.find_active_job(conversation_id) is not None:
            raise ChatTurnInProgressError
        turn = ChatTurn(conversation_id=conversation_id, question=question)
        self._repository.add_turn(turn)
        return self._attach_job(
            owner,
            conversation,
            turn,
            client_request_key=client_request_key,
            payload=payload,
        )

    def refresh_turn(
        self,
        owner: AppUser,
        conversation_id: int,
        turn_id: int,
        *,
        client_request_key: str,
    ) -> tuple[ChatTurn, GenerationJob]:
        conversation = self._repository.lock_owned_conversation(conversation_id, owner.id)
        if conversation is None:
            raise ConversationNotFoundError
        original = self._repository.find_turn(conversation_id, turn_id)
        if original is None:
            raise ChatTurnNotFoundError
        payload = _turn_payload(conversation_id, original.question, turn_id)
        existing = self._jobs.find_request(
            owner, kind="chat", client_request_key=client_request_key
        )
        if existing is not None:
            return self._reuse_turn(conversation_id, existing, payload)
        if self._repository.find_active_job(conversation_id) is not None:
            raise ChatTurnInProgressError
        turn = ChatTurn(
            conversation_id=conversation_id,
            question=original.question,
            query_scope=original.query_scope,
        )
        self._repository.add_turn(turn)
        return self._attach_job(
            owner,
            conversation,
            turn,
            client_request_key=client_request_key,
            payload=payload,
        )

    def retry_turn(
        self,
        owner: AppUser,
        conversation_id: int,
        turn_id: int,
        *,
        client_request_key: str,
    ) -> tuple[ChatTurn, GenerationJob]:
        conversation = self._repository.lock_owned_conversation(conversation_id, owner.id)
        if conversation is None:
            raise ConversationNotFoundError
        turn = self._repository.find_turn(conversation_id, turn_id)
        if turn is None:
            raise ChatTurnNotFoundError
        payload = _retry_payload(conversation_id, turn.question, turn_id)
        existing = self._jobs.find_request(
            owner, kind="chat", client_request_key=client_request_key
        )
        if existing is not None:
            return self._reuse_turn(conversation_id, existing, payload)
        current = self._repository.find_job(turn.active_job_id)
        if current is None or current.state not in ("failed", "interrupted"):
            raise ChatTurnNotRetryableError
        if self._repository.find_active_job(conversation_id) is not None:
            raise ChatTurnInProgressError
        turn.answer = None
        turn.answered_at = None
        return self._attach_job(
            owner,
            conversation,
            turn,
            client_request_key=client_request_key,
            payload=payload,
        )

    def _attach_job(
        self,
        owner: AppUser,
        conversation: Conversation,
        turn: ChatTurn,
        *,
        client_request_key: str,
        payload: dict[str, object],
    ) -> tuple[ChatTurn, GenerationJob]:
        job, created = self._jobs.submit_job(
            owner,
            kind="chat",
            client_request_key=client_request_key,
            payload=payload,
            commit=False,
        )
        if not created:
            return self._reuse_turn(conversation.id, job, payload)
        turn.active_job_id = job.id
        turn.data_cutoff_at = job.data_cutoff_at
        conversation.updated_at = self._clock()
        self._session.commit()
        return turn, job

    def _reuse_turn(
        self, conversation_id: int, job: GenerationJob, payload: dict[str, object]
    ) -> tuple[ChatTurn, GenerationJob]:
        if job.request_digest != request_digest(payload):
            raise RequestKeyConflictError
        turn = self._repository.find_turn_by_active_job(job.id)
        if turn is None or turn.conversation_id != conversation_id:
            raise RequestKeyConflictError
        return turn, job
