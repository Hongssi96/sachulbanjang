import argparse
import logging
import sys
import time
from datetime import timedelta

from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.db.session import create_database_engine, create_session_factory
from app.repositories.process_replay import ProcessReplayRepository
from app.services.process_replay import ProcessReplayNotFoundError, ProcessReplayService

logger = logging.getLogger(__name__)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run one imported process replay.")
    parser.add_argument("replay_id", type=int)
    parser.add_argument("--interval-seconds", type=float, default=5.0)
    parser.add_argument("--once", action="store_true", help="Advance at most once and exit")
    return parser


def advance_with_new_session(
    factory: sessionmaker[Session], replay_id: int, interval: timedelta
) -> tuple[str, bool]:
    with factory() as session:
        result = ProcessReplayService(
            session,
            ProcessReplayRepository(session),
            interval=interval,
        ).advance_once(replay_id)
    return result.state, result.advanced


def main() -> int:
    args = build_parser().parse_args()
    if args.replay_id <= 0:
        raise SystemExit("replay_id must be positive")
    interval = timedelta(seconds=args.interval_seconds)
    if interval <= timedelta(0):
        raise SystemExit("interval-seconds must be positive")

    engine = create_database_engine(get_settings().database_url)
    factory = create_session_factory(engine)
    try:
        while True:
            state, advanced = advance_with_new_session(factory, args.replay_id, interval)
            if advanced:
                logger.info("process replay advanced", extra={"replay_id": args.replay_id})
            if args.once or state in {"completed", "failed"}:
                return 0
            time.sleep(min(args.interval_seconds, 1.0))
    except KeyboardInterrupt:
        logger.info("process replay worker stopped", extra={"replay_id": args.replay_id})
        return 0
    except ProcessReplayNotFoundError as error:
        print(str(error), file=sys.stderr)
        return 1
    finally:
        engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
