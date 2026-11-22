import app.models  # noqa: F401
from app.db.base import Base
from sqlalchemy import CheckConstraint, UniqueConstraint


def test_core_schema_registers_expected_tables() -> None:
    assert set(Base.metadata.tables) == {
        "app_user",
        "auth_session",
        "department",
        "equipment",
        "process_record",
        "process_replay",
        "product",
        "production_line",
        "refresh_credential",
        "source_import",
    }


def test_process_record_preserves_source_identity_and_explicit_cycle_unit() -> None:
    table = Base.metadata.tables["process_record"]

    assert "cycle_time_seconds" in table.c
    assert "cycle_time" not in table.c
    assert table.c.available_at.nullable
    assert table.c.product_id.nullable
    assert any(
        isinstance(constraint, UniqueConstraint)
        and {column.name for column in constraint.columns}
        == {"source_import_id", "source_row_number"}
        for constraint in table.constraints
    )
    assert any(
        isinstance(constraint, UniqueConstraint)
        and {column.name for column in constraint.columns}
        == {"source_namespace", "source_record_key"}
        for constraint in table.constraints
    )
    assert any(
        isinstance(constraint, CheckConstraint)
        and constraint.name == "ck_process_record_cycle_time_seconds"
        for constraint in table.constraints
    )


def test_equipment_line_and_product_code_allow_unconfirmed_csv_values() -> None:
    equipment = Base.metadata.tables["equipment"]
    product = Base.metadata.tables["product"]

    assert equipment.c.production_line_id.nullable
    assert product.c.product_code.nullable
