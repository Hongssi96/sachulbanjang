import app.models  # noqa: F401
from app.db.base import Base
from sqlalchemy import CheckConstraint, UniqueConstraint


def test_core_schema_registers_expected_tables() -> None:
    assert set(Base.metadata.tables) == {
        "account_audit_event",
        "app_user",
        "auth_session",
        "department",
        "equipment",
        "generation_job",
        "inspection_record",
        "process_record",
        "process_replay",
        "product",
        "production_line",
        "record_change",
        "refresh_credential",
        "report",
        "report_revision",
        "report_status_event",
        "schedule",
        "source_import",
        "stock_balance",
        "stock_movement",
        "user_assignment",
        "work_extension",
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


def test_inspection_record_requires_verdict_and_allows_missing_details() -> None:
    table = Base.metadata.tables["inspection_record"]

    assert not table.c.verdict.nullable
    assert table.c.product_id.nullable
    assert table.c.process_record_id.nullable
    assert table.c.defect_type.nullable
    assert table.c.reason.nullable
    assert any(
        isinstance(constraint, CheckConstraint)
        and constraint.name == "ck_inspection_record_verdict"
        for constraint in table.constraints
    )


def test_equipment_line_and_product_code_allow_unconfirmed_csv_values() -> None:
    equipment = Base.metadata.tables["equipment"]
    product = Base.metadata.tables["product"]

    assert equipment.c.production_line_id.nullable
    assert product.c.product_code.nullable


def test_auth_session_tracks_shared_work_end_and_extension_version() -> None:
    table = Base.metadata.tables["auth_session"]

    assert not table.c.work_ends_at.nullable
    assert not table.c.work_session_version.nullable
    assert table.c.auto_extended_for.nullable
    assert any(
        isinstance(constraint, CheckConstraint)
        and constraint.name == "ck_auth_session_work_session_version"
        for constraint in table.constraints
    )
