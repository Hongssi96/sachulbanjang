import argparse
import getpass
import sys
from datetime import time

from app.core.config import get_settings
from app.db.session import create_database_engine, create_session_factory
from app.repositories.auth import AuthRepository
from app.services.account_seed import AccountSeedError, AccountSeedService, SeedAccountRequest


def parse_local_time(value: str) -> time:
    try:
        return time.fromisoformat(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError(
            f"invalid time '{value}': use HH:MM or HH:MM:SS"
        ) from error


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Create a pre-provisioned administrator or worker account.",
        epilog="Existing employee numbers are reported instead of being overwritten.",
    )
    parser.add_argument("--employee-no", required=True, help="Login identifier")
    parser.add_argument("--display-name", required=True)
    parser.add_argument("--role", choices=["admin", "worker"], required=True)
    parser.add_argument(
        "--password",
        help="Omit to be prompted without echo. The value is not stored in the repository.",
    )
    parser.add_argument("--shift-start", type=parse_local_time, default=time(9, 0), metavar="HH:MM")
    parser.add_argument("--shift-end", type=parse_local_time, default=time(18, 0), metavar="HH:MM")
    parser.add_argument(
        "--no-must-change-password",
        action="store_true",
        help="Skip the temporary-password flag required after login",
    )
    return parser


def resolve_password(explicit: str | None) -> str:
    if explicit is not None:
        return explicit
    return getpass.getpass("password: ")


def main() -> int:
    args = build_parser().parse_args()
    request = SeedAccountRequest(
        employee_no=args.employee_no,
        display_name=args.display_name,
        password=resolve_password(args.password),
        role=args.role,
        shift_start_local=args.shift_start,
        shift_end_local=args.shift_end,
        must_change_password=not args.no_must_change_password,
    )

    engine = create_database_engine(get_settings().database_url)
    try:
        factory = create_session_factory(engine)
        with factory() as session:
            service = AccountSeedService(session, AuthRepository(session))
            try:
                user = service.create_account(request)
            except AccountSeedError as error:
                print(f"account not created: {error}", file=sys.stderr)
                return 1
            summary = (
                f"account created: employee_no={user.employee_no}, role={user.role}, "
                f"must_change_password={user.must_change_password}"
            )
    finally:
        engine.dispose()

    print(summary)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
