import argparse
import sys

from app.core.config import get_settings
from app.db.session import create_database_engine, create_session_factory
from app.repositories.report_job import ReportJobRepository
from app.services.report_job import ReportJobService


def build_parser() -> argparse.ArgumentParser:
    return argparse.ArgumentParser(
        description="Mark chat jobs whose worker lease expired as interrupted.",
        epilog=(
            "Interrupted chat jobs keep their question so the requester can retry. "
            "Server recovery does not re-run them automatically."
        ),
    )


def main() -> int:
    build_parser().parse_args()

    engine = create_database_engine(get_settings().database_url)
    try:
        factory = create_session_factory(engine)
        with factory() as session:
            service = ReportJobService(session, ReportJobRepository(session))
            interrupted = service.mark_stale_jobs_interrupted(kind="chat")
    except Exception as error:
        print(f"chat job reap failed: {error}", file=sys.stderr)
        return 1
    finally:
        engine.dispose()

    print(f"chat jobs interrupted: {interrupted}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
