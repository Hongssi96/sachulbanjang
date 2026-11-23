from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.models.handover import HandoverNote, HandoverRead, HandoverTarget
from app.models.master import AppUser
from app.repositories.handover import (
    HandoverNoteRow,
    HandoverReadRow,
    HandoverRepository,
    HandoverTargetRow,
)

Clock = Callable[[], datetime]

_TARGET_FIELDS = {
    "department": "department_id",
    "production_line": "production_line_id",
    "equipment": "equipment_id",
}


def _utc_now() -> datetime:
    return datetime.now(UTC)


class HandoverError(Exception):
    """Base exception for rejected handover note operations."""


class HandoverNotFoundError(HandoverError):
    """Raised when a note does not exist or is soft-deleted."""


class HandoverVersionConflictError(HandoverError):
    """Raised when an edit is based on an outdated note version."""

    def __init__(self, current_version: int) -> None:
        self.current_version = current_version
        super().__init__("handover note was changed by another request")


class HandoverForbiddenError(HandoverError):
    """Raised when a user edits or deletes a note they do not own."""


class InvalidHandoverError(HandoverError):
    """Raised when the note body or targets are not valid."""


@dataclass(frozen=True)
class HandoverPage:
    notes: list[HandoverNoteRow]
    targets: dict[int, list[HandoverTargetRow]]
    confirmed_counts: dict[int, int]
    my_reads: dict[int, datetime]
    total_items: int


class HandoverService:
    """Handover notes with author-only edits, admin deletes, and confirmations."""

    def __init__(
        self,
        session: Session,
        repository: HandoverRepository,
        clock: Clock = _utc_now,
    ) -> None:
        self._session = session
        self._repository = repository
        self._clock = clock

    def create_note(
        self,
        actor: AppUser,
        *,
        body: str,
        targets: Sequence[tuple[str, int]] | None,
    ) -> int:
        pairs = (
            list(targets)
            if targets is not None
            else self._repository.find_assignment_pairs(actor.id)
        )
        self._validate_targets(pairs)
        note = HandoverNote(author_id=actor.id, body=body, version=1)
        self._repository.add_note(note)
        self._add_targets(note.id, pairs)
        self._session.commit()
        return note.id

    def list_notes(
        self,
        actor: AppUser,
        *,
        body_query: str | None,
        target_kind: str | None,
        target_id: int | None,
        include_all: bool,
        page: int,
        page_size: int,
    ) -> HandoverPage:
        if target_kind is not None and target_id is not None:
            pairs: list[tuple[str, int]] = []
        elif actor.role != "admin" and not include_all:
            pairs = self._repository.find_assignment_pairs(actor.id)
        else:
            pairs = []

        normalized = body_query.strip() if body_query is not None else ""
        total_items = self._repository.count_notes(
            body_query=normalized or None,
            target_kind=target_kind,
            target_id=target_id,
            assignment_pairs=pairs,
        )
        notes = self._repository.find_notes(
            body_query=normalized or None,
            target_kind=target_kind,
            target_id=target_id,
            assignment_pairs=pairs,
            offset=(page - 1) * page_size,
            limit=page_size,
        )
        note_ids = [row.note.id for row in notes]
        targets: dict[int, list[HandoverTargetRow]] = {}
        for target_row in self._repository.find_target_rows(note_ids):
            targets.setdefault(target_row.target.handover_note_id, []).append(target_row)
        return HandoverPage(
            notes=notes,
            targets=targets,
            confirmed_counts=self._repository.count_reads(note_ids),
            my_reads=self._repository.find_my_reads(actor.id, note_ids),
            total_items=total_items,
        )

    def get_note(
        self, actor: AppUser, note_id: int
    ) -> tuple[HandoverNoteRow, list[HandoverTargetRow], list[HandoverReadRow], datetime | None]:
        row = self._repository.find_note_row(note_id)
        if row is None:
            raise HandoverNotFoundError
        targets = self._repository.find_target_rows([note_id])
        reads = self._repository.list_reads([note_id]).get(note_id, [])
        mine = self._repository.find_read(note_id, actor.id)
        return row, targets, reads, mine.confirmed_at if mine is not None else None

    def update_note(
        self,
        actor: AppUser,
        note_id: int,
        *,
        version: int,
        body: str | None,
        targets: Sequence[tuple[str, int]] | None,
    ) -> None:
        note = self._repository.lock_note(note_id)
        if note is None:
            raise HandoverNotFoundError
        if note.author_id != actor.id:
            raise HandoverForbiddenError
        if note.version != version:
            raise HandoverVersionConflictError(note.version)
        if body is None and targets is None:
            raise InvalidHandoverError

        if body is not None and body != note.body:
            note.body = body
        if targets is not None:
            pairs = list(targets)
            self._validate_targets(pairs)
            self._repository.delete_targets(note_id)
            self._add_targets(note_id, pairs)
        note.version += 1
        self._session.commit()

    def delete_note(self, actor: AppUser, note_id: int, *, expected_version: int) -> None:
        note = self._repository.lock_note(note_id)
        if note is None:
            raise HandoverNotFoundError
        if actor.role != "admin" and note.author_id != actor.id:
            raise HandoverForbiddenError
        if note.version != expected_version:
            raise HandoverVersionConflictError(note.version)
        note.deleted_at = self._clock()
        note.version += 1
        self._session.commit()

    def confirm_note(self, actor: AppUser, note_id: int) -> HandoverRead:
        if self._repository.find_note(note_id) is None:
            raise HandoverNotFoundError
        existing = self._repository.find_read(note_id, actor.id)
        if existing is not None:
            return existing
        read = HandoverRead(handover_note_id=note_id, user_id=actor.id, confirmed_at=self._clock())
        self._repository.add_read(read)
        self._session.commit()
        return read

    def _add_targets(self, note_id: int, pairs: Sequence[tuple[str, int]]) -> None:
        for kind, target_id in pairs:
            self._repository.add_target(
                HandoverTarget(handover_note_id=note_id, **{_TARGET_FIELDS[kind]: target_id})
            )

    def _validate_targets(self, pairs: Sequence[tuple[str, int]]) -> None:
        seen: set[tuple[str, int]] = set()
        for kind, target_id in pairs:
            if kind not in _TARGET_FIELDS:
                raise InvalidHandoverError
            if (kind, target_id) in seen:
                raise InvalidHandoverError
            seen.add((kind, target_id))
            exists = False
            if kind == "department":
                exists = self._repository.find_active_department(target_id) is not None
            elif kind == "production_line":
                exists = self._repository.find_active_production_line(target_id) is not None
            else:
                exists = self._repository.find_active_equipment(target_id) is not None
            if not exists:
                raise InvalidHandoverError
