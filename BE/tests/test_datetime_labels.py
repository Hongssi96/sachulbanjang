from datetime import UTC, datetime, timedelta, timezone

from app.core.datetime_labels import korean_kst_label


def test_korean_kst_label_converts_utc_to_seoul() -> None:
    assert korean_kst_label(datetime(2026, 11, 23, 6, 0, tzinfo=UTC)) == "2026-11-23 15:00 (KST)"


def test_korean_kst_label_converts_other_offsets() -> None:
    value = datetime(2026, 11, 23, 6, 0, tzinfo=timezone(timedelta(hours=-5)))
    assert korean_kst_label(value) == "2026-11-23 20:00 (KST)"


def test_korean_kst_label_crosses_date_boundary() -> None:
    assert korean_kst_label(datetime(2026, 11, 23, 20, 30, tzinfo=UTC)) == "2026-11-24 05:30 (KST)"
