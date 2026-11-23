from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import ColumnElement, delete, func, or_, select
from sqlalchemy.orm import Session

from app.models.handover import HandoverNote, HandoverRead, HandoverTarget
from app.models.master import AppUser, Department, Equipment, ProductionLine, UserAssignment

_TARGET_COLUMNS = {
    "department": HandoverTarget.department_id,
    "production_line": HandoverTarget.production_line_id,
    "equipment": HandoverTarget.equipment_id,
}


@dataclass(frozen=True)
class HandoverTargetRow:
    target: HandoverTarget
    code: str | None
    name: str


@dataclass(frozen=True)
class HandoverNoteRow:
    note: HandoverNote
    author_display_name: str


@dataclass(frozen=True)
class HandoverReadRow:
    read: HandoverRead
    display_name: str


class HandoverRepository:
    """Data access for handover notes, targets, and confirmations."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def add_note(self, note: HandoverNote) -> None:
        self._session.add(note)
        self._session.flush()

    def find_note(self, note_id: int) -> HandoverNote | None:
        return self._session.scalar(
            select(HandoverNote).where(
                HandoverNote.id == note_id, HandoverNote.deleted_at.is_(None)
            )
        )

    def lock_note(self, note_id: int) -> HandoverNote | None:
        return self._session.scalar(
            select(HandoverNote)
            .where(HandoverNote.id == note_id, HandoverNote.deleted_at.is_(None))
            .with_for_update()
        )

    def add_target(self, target: HandoverTarget) -> None:
        self._session.add(target)

    def delete_targets(self, note_id: int) -> None:
        self._session.execute(
            delete(HandoverTarget).where(HandoverTarget.handover_note_id == note_id)
        )

    def find_target_rows(self, note_ids: list[int]) -> list[HandoverTargetRow]:
        if not note_ids:
            return []
        rows = self._session.execute(
            select(
                HandoverTarget,
                Department.code,
                Department.name,
                ProductionLine.code,
                ProductionLine.name,
                Equipment.equipment_code,
                Equipment.name,
            )
            .outerjoin(Department, Department.id == HandoverTarget.department_id)
            .outerjoin(ProductionLine, ProductionLine.id == HandoverTarget.production_line_id)
            .outerjoin(Equipment, Equipment.id == HandoverTarget.equipment_id)
            .where(HandoverTarget.handover_note_id.in_(note_ids))
            .order_by(HandoverTarget.id.asc())
        ).all()
        result: list[HandoverTargetRow] = []
        for target, dept_code, dept_name, line_code, line_name, equip_code, equip_name in rows:
            if target.department_id is not None:
                result.append(HandoverTargetRow(target=target, code=dept_code, name=dept_name))
            elif target.production_line_id is not None:
                result.append(HandoverTargetRow(target=target, code=line_code, name=line_name))
            else:
                result.append(HandoverTargetRow(target=target, code=equip_code, name=equip_name))
        return result

    def find_assignment_pairs(self, user_id: int) -> list[tuple[str, int]]:
        rows = self._session.execute(
            select(
                UserAssignment.department_id,
                UserAssignment.production_line_id,
                UserAssignment.equipment_id,
            ).where(UserAssignment.user_id == user_id, UserAssignment.deleted_at.is_(None))
        ).all()
        pairs: list[tuple[str, int]] = []
        for department_id, line_id, equipment_id in rows:
            if department_id is not None:
                pairs.append(("department", int(department_id)))
            elif line_id is not None:
                pairs.append(("production_line", int(line_id)))
            elif equipment_id is not None:
                pairs.append(("equipment", int(equipment_id)))
        return pairs

    def find_active_department(self, target_id: int) -> Department | None:
        return self._session.scalar(
            select(Department).where(Department.id == target_id, Department.deleted_at.is_(None))
        )

    def find_active_production_line(self, target_id: int) -> ProductionLine | None:
        return self._session.scalar(
            select(ProductionLine).where(
                ProductionLine.id == target_id, ProductionLine.deleted_at.is_(None)
            )
        )

    def find_active_equipment(self, target_id: int) -> Equipment | None:
        return self._session.scalar(
            select(Equipment).where(Equipment.id == target_id, Equipment.deleted_at.is_(None))
        )

    def _target_conditions(
        self,
        *,
        target_kind: str | None,
        target_id: int | None,
        assignment_pairs: list[tuple[str, int]],
    ) -> list[ColumnElement[bool]]:
        conditions: list[ColumnElement[bool]] = []
        if target_kind is not None and target_id is not None:
            column = _TARGET_COLUMNS[target_kind]
            conditions.append(
                HandoverNote.id.in_(
                    select(HandoverTarget.handover_note_id).where(column == target_id)
                )
            )
        elif assignment_pairs:
            pairs = [
                _TARGET_COLUMNS[kind] == value
                for kind, value in assignment_pairs
                if kind in _TARGET_COLUMNS
            ]
            conditions.append(
                HandoverNote.id.in_(select(HandoverTarget.handover_note_id).where(or_(*pairs)))
            )
        return conditions

    def _conditions(
        self,
        *,
        body_query: str | None,
        target_kind: str | None,
        target_id: int | None,
        assignment_pairs: list[tuple[str, int]],
    ) -> list[ColumnElement[bool]]:
        conditions: list[ColumnElement[bool]] = [HandoverNote.deleted_at.is_(None)]
        if body_query:
            escaped = body_query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            conditions.append(HandoverNote.body.ilike(f"%{escaped}%", escape="\\"))
        conditions.extend(
            self._target_conditions(
                target_kind=target_kind,
                target_id=target_id,
                assignment_pairs=assignment_pairs,
            )
        )
        return conditions

    def count_notes(
        self,
        *,
        body_query: str | None,
        target_kind: str | None,
        target_id: int | None,
        assignment_pairs: list[tuple[str, int]],
    ) -> int:
        conditions = self._conditions(
            body_query=body_query,
            target_kind=target_kind,
            target_id=target_id,
            assignment_pairs=assignment_pairs,
        )
        return (
            self._session.scalar(select(func.count()).select_from(HandoverNote).where(*conditions))
            or 0
        )

    def find_notes(
        self,
        *,
        body_query: str | None,
        target_kind: str | None,
        target_id: int | None,
        assignment_pairs: list[tuple[str, int]],
        offset: int,
        limit: int,
    ) -> list[HandoverNoteRow]:
        conditions = self._conditions(
            body_query=body_query,
            target_kind=target_kind,
            target_id=target_id,
            assignment_pairs=assignment_pairs,
        )
        rows = self._session.execute(
            select(HandoverNote, AppUser.display_name)
            .join(AppUser, AppUser.id == HandoverNote.author_id)
            .where(*conditions)
            .order_by(HandoverNote.created_at.desc(), HandoverNote.id.desc())
            .offset(offset)
            .limit(limit)
        )
        return [
            HandoverNoteRow(note=note, author_display_name=author_name)
            for note, author_name in rows
        ]

    def find_note_row(self, note_id: int) -> HandoverNoteRow | None:
        row = self._session.execute(
            select(HandoverNote, AppUser.display_name)
            .join(AppUser, AppUser.id == HandoverNote.author_id)
            .where(HandoverNote.id == note_id, HandoverNote.deleted_at.is_(None))
        ).first()
        if row is None:
            return None
        note, author_name = row
        return HandoverNoteRow(note=note, author_display_name=author_name)

    def find_read(self, note_id: int, user_id: int) -> HandoverRead | None:
        return self._session.scalar(
            select(HandoverRead).where(
                HandoverRead.handover_note_id == note_id, HandoverRead.user_id == user_id
            )
        )

    def add_read(self, read: HandoverRead) -> None:
        self._session.add(read)
        self._session.flush()

    def list_reads(self, note_ids: list[int]) -> dict[int, list[HandoverReadRow]]:
        if not note_ids:
            return {}
        rows = self._session.execute(
            select(HandoverRead, AppUser.display_name)
            .join(AppUser, AppUser.id == HandoverRead.user_id)
            .where(HandoverRead.handover_note_id.in_(note_ids))
            .order_by(HandoverRead.confirmed_at.asc(), HandoverRead.id.asc())
        ).all()
        result: dict[int, list[HandoverReadRow]] = {}
        for read, display_name in rows:
            result.setdefault(read.handover_note_id, []).append(
                HandoverReadRow(read=read, display_name=display_name)
            )
        return result

    def count_reads(self, note_ids: list[int]) -> dict[int, int]:
        if not note_ids:
            return {}
        rows = self._session.execute(
            select(HandoverRead.handover_note_id, func.count())
            .where(HandoverRead.handover_note_id.in_(note_ids))
            .group_by(HandoverRead.handover_note_id)
        ).all()
        return {int(note_id): int(count) for note_id, count in rows}

    def find_my_reads(self, user_id: int, note_ids: list[int]) -> dict[int, datetime]:
        if not note_ids:
            return {}
        rows = self._session.execute(
            select(HandoverRead.handover_note_id, HandoverRead.confirmed_at).where(
                HandoverRead.user_id == user_id,
                HandoverRead.handover_note_id.in_(note_ids),
            )
        ).all()
        return {int(note_id): confirmed_at for note_id, confirmed_at in rows}
