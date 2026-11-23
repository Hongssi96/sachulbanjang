import argparse
import json
import sys

from pydantic import ValidationError

from app.core.config import get_settings
from app.db.session import create_database_engine, create_session_factory
from app.repositories.master_data import MasterDataRepository
from app.schemas.master_data_seed import MasterDataSeedRequest
from app.services.master_data_seed import MasterDataSeedError, MasterDataSeedService


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Load organization master data and user assignments from a JSON file.",
        epilog=(
            "Departments and lines are created when missing, equipment keeps its current line, "
            "and assignments are never duplicated. Re-running the same file is safe."
        ),
    )
    parser.add_argument("--file", required=True, help="Path to the master data JSON file")
    return parser


def load_request(path: str) -> MasterDataSeedRequest:
    with open(path, encoding="utf-8") as handle:
        payload = json.load(handle)
    return MasterDataSeedRequest.model_validate(payload)


def main() -> int:
    args = build_parser().parse_args()
    try:
        request = load_request(args.file)
    except (OSError, json.JSONDecodeError, ValidationError) as error:
        print(f"master data not loaded: {error}", file=sys.stderr)
        return 1

    engine = create_database_engine(get_settings().database_url)
    try:
        factory = create_session_factory(engine)
        with factory() as session:
            service = MasterDataSeedService(session, MasterDataRepository(session))
            try:
                result = service.seed(request)
            except MasterDataSeedError as error:
                session.rollback()
                print(f"master data not applied: {error}", file=sys.stderr)
                return 1
    finally:
        engine.dispose()

    print(
        "master data applied: "
        f"departments={result.departments_created}, "
        f"production_lines={result.production_lines_created}, "
        f"equipment_linked={result.equipment_linked}, "
        f"assignments={result.assignments_created}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
