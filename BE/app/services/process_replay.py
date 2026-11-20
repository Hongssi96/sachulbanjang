from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal, cast

from sqlalchemy.orm import Session

from app.models.process import ProcessReplay
from app.repositories.process_replay import ProcessReplayRepository

ReplayState = Literal["ready", "running", "completed", "failed"]
ReplayDisplayState = Literal["ready", "running", "delayed", "completed", "failed"]


class ProcessReplayNotFoundError(LookupError):
    """Raised when the requested replay does not exist."""


@dataclass(frozen=True)
class ReplayAdvanceResult:
    replay_id: int
    state: ReplayState
    advanced: bool
    cursor: int
    data_time: datetime | None
    last_advanced_at: datetime | None
    next_due_at: datetime | None


def derive_replay_display_state(
    replay: ProcessReplay, queried_at: datetime, delay_threshold: timedelta
) -> ReplayDisplayState:
    if replay.state == "completed":
        return "completed"
    if replay.state == "failed":
        return "failed"
    if replay.state == "ready":
        return "ready"
    if replay.last_advanced_at is None:
        return "delayed"
    if queried_at - replay.last_advanced_at >= delay_threshold:
        return "delayed"
    return "running"


class ProcessReplayService:
    """Advances a replay atomically while serializing competing workers."""

    def __init__(
        self,
        session: Session,
        repository: ProcessReplayRepository,
        *,
        interval: timedelta = timedelta(seconds=5),
    ) -> None:
        if interval <= timedelta(0):
            raise ValueError("interval must be positive")
        self._session = session
        self._repository = repository
        self._interval = interval

    def advance_once(self, replay_id: int, *, now: datetime | None = None) -> ReplayAdvanceResult:
        advanced_at = now or datetime.now(UTC)
        if advanced_at.tzinfo is None or advanced_at.utcoffset() is None:
            raise ValueError("now must be timezone-aware")

        with self._session.begin():
            replay = self._repository.lock_replay(replay_id)
            if replay is None:
                raise ProcessReplayNotFoundError(f"process replay {replay_id} was not found")

            if replay.state in {"completed", "failed"}:
                return self._result(replay, advanced=False)

            if (
                replay.last_advanced_at is not None
                and advanced_at < replay.last_advanced_at + self._interval
            ):
                return self._result(replay, advanced=False)

            record = self._repository.find_next_record(replay.source_import_id, replay.cursor)
            if record is None:
                replay.state = "completed"
                return self._result(replay, advanced=False)

            record.available_at = advanced_at
            replay.cursor = record.source_row_number
            replay.data_time = record.occurred_at
            replay.last_advanced_at = advanced_at
            replay.state = "running"

            if self._repository.find_next_record(replay.source_import_id, replay.cursor) is None:
                replay.state = "completed"

            return self._result(replay, advanced=True)

    def mark_failed(self, replay_id: int, error_code: str) -> None:
        if not error_code.strip():
            raise ValueError("error_code is required")
        with self._session.begin():
            replay = self._repository.lock_replay(replay_id)
            if replay is None:
                raise ProcessReplayNotFoundError(f"process replay {replay_id} was not found")
            if replay.state == "completed":
                return
            replay.state = "failed"
            replay.error_code = error_code

    def _result(self, replay: ProcessReplay, *, advanced: bool) -> ReplayAdvanceResult:
        next_due_at = (
            replay.last_advanced_at + self._interval
            if replay.state == "running" and replay.last_advanced_at is not None
            else None
        )
        return ReplayAdvanceResult(
            replay_id=replay.id,
            state=cast(ReplayState, replay.state),
            advanced=advanced,
            cursor=replay.cursor,
            data_time=replay.data_time,
            last_advanced_at=replay.last_advanced_at,
            next_due_at=next_due_at,
        )
