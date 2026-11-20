from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from app.db.migrations import MigrationVersionError, assert_database_at_head
from sqlalchemy import Engine


def test_migration_check_rejects_outdated_database() -> None:
    engine = MagicMock(spec=Engine)
    connection = engine.connect.return_value.__enter__.return_value

    with (
        patch("app.db.migrations.ScriptDirectory.from_config") as script_directory,
        patch("app.db.migrations.MigrationContext.configure") as migration_context,
    ):
        script_directory.return_value.get_heads.return_value = ["head"]
        migration_context.return_value.get_current_heads.return_value = ("old",)

        with pytest.raises(MigrationVersionError, match="alembic upgrade head"):
            assert_database_at_head(engine, Path("alembic.ini"))

    assert connection is not None
