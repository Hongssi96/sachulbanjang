from datetime import datetime
from zoneinfo import ZoneInfo

SEOUL = ZoneInfo("Asia/Seoul")


def korean_kst_label(value: datetime) -> str:
    """Readable Korean-standard label for a timezone-aware instant.

    Example: 2026-11-23 06:00 UTC -> "2026-11-23 15:00 (KST)".
    """
    return value.astimezone(SEOUL).strftime("%Y-%m-%d %H:%M (KST)")
