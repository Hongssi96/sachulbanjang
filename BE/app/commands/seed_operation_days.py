from __future__ import annotations

import argparse
import hashlib
import sys
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from app.core.config import get_settings
from app.db.session import create_database_engine, create_session_factory
from app.models.operation import OperationDay
from app.repositories.master_data import MasterDataRepository
from app.repositories.operation import OperationRepository

SEOUL = ZoneInfo("Asia/Seoul")
_PLANNED_SECONDS = 8 * 3600
# Deterministic demo ratios inside 6~8 hours of an 8 hour plan.
_ACTUAL_PERCENTS = (75, 80, 85, 90, 100)


def _actual_seconds(equipment_id: int, day: date) -> int:
    digest = hashlib.sha256(f"{equipment_id}:{day.isoformat()}".encode()).digest()
    percent = _ACTUAL_PERCENTS[digest[0] % len(_ACTUAL_PERCENTS)]
    return _PLANNED_SECONDS * percent // 100


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Seed demo equipment run-time rows for the last N days.",
        epilog="Existing (equipment, day) rows are kept as they are.",
    )
    parser.add_argument("--days", type=int, default=14, help="Number of days to seed (default 14).")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.days < 1 or args.days > 90:
        raise SystemExit("--days must be between 1 and 90")

    settings = get_settings()
    engine = create_database_engine(settings.database_url)
    created = 0
    try:
        factory = create_session_factory(engine)
        with factory() as session:
            today = datetime.now(UTC).astimezone(SEOUL).date()
            date_from = today - timedelta(days=args.days - 1)
            equipment = MasterDataRepository(session).list_active_equipment(production_line_id=None)
            if not equipment:
                print("operation days created: 0 (no active equipment)")
                return 0
            repository = OperationRepository(session)
            existing = repository.find_existing_keys(date_from=date_from, date_to=today)
            rows: list[OperationDay] = []
            for item in equipment:
                for offset in range(args.days):
                    day = date_from + timedelta(days=offset)
                    if (item.id, day) in existing:
                        continue
                    rows.append(
                        OperationDay(
                            equipment_id=item.id,
                            day=day,
                            planned_seconds=_PLANNED_SECONDS,
                            actual_seconds=_actual_seconds(item.id, day),
                            is_demo=True,
                        )
                    )
            repository.add_days(rows)
            session.commit()
            created = len(rows)
    except Exception as error:
        print(f"operation day seed failed: {error}", file=sys.stderr)
        return 1
    finally:
        engine.dispose()

    print(f"operation days created: {created}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
