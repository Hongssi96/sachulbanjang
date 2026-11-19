from pathlib import Path

from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import Engine


class MigrationVersionError(RuntimeError):
    """Raised when the database schema is not at the code migration head."""


def assert_database_at_head(engine: Engine, alembic_ini_path: Path) -> None:
    config = Config(alembic_ini_path)
    scripts = ScriptDirectory.from_config(config)
    expected_heads = set(scripts.get_heads())

    with engine.connect() as connection:
        current_heads = set(MigrationContext.configure(connection).get_current_heads())

    if current_heads != expected_heads:
        current = ", ".join(sorted(current_heads)) or "none"
        expected = ", ".join(sorted(expected_heads)) or "none"
        raise MigrationVersionError(
            "Database migration is not current "
            f"(current: {current}; expected: {expected}). Run 'alembic upgrade head'."
        )
