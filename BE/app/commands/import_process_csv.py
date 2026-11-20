import argparse
import sys
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import create_database_engine
from app.repositories.process_import import ProcessImportRepository
from app.services.process_import import ProcessImportError, ProcessImportService, read_process_csv


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Import molding process CSV data atomically.")
    parser.add_argument("csv_path", type=Path)
    parser.add_argument(
        "--source-timezone",
        required=True,
        help="IANA timezone of naive TimeStamp values, for example Asia/Seoul",
    )
    parser.add_argument("--source-namespace", default="molding_csv")
    parser.add_argument("--batch-size", type=int, default=1_000)
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="Validate every row without connecting to the database",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.validate_only:
        try:
            row_count = sum(1 for _ in read_process_csv(args.csv_path, args.source_timezone))
        except ProcessImportError as error:
            print(f"validation rejected: {error}", file=sys.stderr)
            return 1
        print(f"validation completed: rows={row_count}")
        return 0

    engine = create_database_engine(get_settings().database_url)
    try:
        with Session(engine) as session:
            service = ProcessImportService(
                session,
                ProcessImportRepository(session),
                batch_size=args.batch_size,
            )
            try:
                result = service.import_file(
                    args.csv_path,
                    source_timezone=args.source_timezone,
                    source_namespace=args.source_namespace,
                )
            except ProcessImportError as error:
                print(f"import rejected: {error}", file=sys.stderr)
                return 1
    finally:
        engine.dispose()

    print(
        "import completed: "
        f"import_id={result.import_id}, records={result.imported_records}, "
        f"skipped={result.skipped_records}, equipment={result.created_equipment}, "
        f"products={result.created_products}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
