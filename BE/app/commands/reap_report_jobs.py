import argparse
import sys

from app.core.config import get_settings
from app.db.session import create_database_engine, create_session_factory
from app.repositories.report_job import ReportJobRepository
from app.services.report_job import ReportJobService


def build_parser() -> argparse.ArgumentParser:
    return argparse.ArgumentParser(
        description="Mark report generation jobs whose worker lease expired as interrupted.",
        epilog=(
            "Server recovery does not re-run interrupted jobs automatically. "
            "The requester retries them explicitly."
        ),
    )


def main() -> int:
    build_parser().parse_args()

    engine = create_database_engine(get_settings().database_url)
    try:
        factory = create_session_factory(engine)
        with factory() as session:
            service = ReportJobService(session, ReportJobRepository(session))
            interrupted = service.mark_stale_jobs_interrupted()
    except Exception as error:
        print(f"report job reap failed: {error}", file=sys.stderr)
        return 1
    finally:
        engine.dispose()

    print(f"report jobs interrupted: {interrupted}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
