import argparse
import sys

from app.core.config import get_settings
from app.db.session import create_database_engine, create_session_factory
from app.repositories.inspection_seed import InspectionSeedRepository
from app.services.inspection_seed import InspectionSeedService


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Create demo inspection records from imported process CSV verdicts.",
        epilog=(
            "Verdicts come from the PassOrFail column (True/False, Y/N, 0/1) and defect types "
            "from the Reason column. Records that already have an inspection are kept as they are."
        ),
    )
    parser.add_argument("--source-namespace", default="molding_csv")
    return parser


def main() -> int:
    args = build_parser().parse_args()

    engine = create_database_engine(get_settings().database_url)
    try:
        factory = create_session_factory(engine)
        with factory() as session:
            service = InspectionSeedService(session, InspectionSeedRepository(session))
            try:
                result = service.seed(source_namespace=args.source_namespace)
            except Exception as error:
                session.rollback()
                print(f"inspection seed failed: {error}", file=sys.stderr)
                return 1
    finally:
        engine.dispose()

    print(
        "inspection records created: "
        f"{result.created} (existing skipped: {result.skipped_existing}, "
        f"without verdict: {result.skipped_without_verdict})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
