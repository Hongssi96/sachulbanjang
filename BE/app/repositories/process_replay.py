from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.process import ProcessRecord, ProcessReplay


class ProcessReplayRepository:
    """Database access for one-at-a-time process replay advancement."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def lock_replay(self, replay_id: int) -> ProcessReplay | None:
        return self._session.scalar(
            select(ProcessReplay).where(ProcessReplay.id == replay_id).with_for_update()
        )

    def find_next_record(self, source_import_id: int, cursor: int) -> ProcessRecord | None:
        return self._session.scalar(
            select(ProcessRecord)
            .where(
                ProcessRecord.source_import_id == source_import_id,
                ProcessRecord.source_row_number > cursor,
                ProcessRecord.deleted_at.is_(None),
            )
            .order_by(ProcessRecord.source_row_number, ProcessRecord.id)
            .limit(1)
        )
