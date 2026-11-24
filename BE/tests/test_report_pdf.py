from datetime import UTC, datetime

from app.models.report import Report
from app.services.report_pdf import render_report_pdf


def make_report() -> Report:
    return Report(
        id=1,
        author_id=2,
        title="2026년 11월 주간 품질 보고서",
        body_markdown=(
            "## 집계 기준\n"
            "2026.11.17부터 2026.11.23까지의 결과입니다.\n\n"
            "## 생산·품질 요약\n"
            "- 검사 120건 중 양품 112건, 불량 8건입니다.\n"
            "- 불량률은 6.67%입니다.\n\n"
            "## 주요 확인 사항\n"
            "흑점과 치수 불량 기록을 우선 확인해 주세요."
        ),
        category="periodic_weekly",
        report_kind="weekly",
        business_status="pending",
        version=1,
        generation_data_cutoff_at=datetime(2026, 11, 23, 6, 0, tzinfo=UTC),
        generation_snapshot={
            "schema_version": 1,
            "period": {"from": "2026-11-17", "to": "2026-11-23"},
            "data_cutoff_at": "2026-11-23T06:00:00+00:00",
            "resolved_equipment": [
                {"id": 1, "code": "EQ-01", "name": "1호기"},
                {"id": 2, "code": "EQ-02", "name": "2호기"},
            ],
            "summary": {
                "production_record_count": 140,
                "inspected_count": 120,
                "good_count": 112,
                "defect_count": 8,
                "defect_rate_percent": "6.67",
                "defect_types": [
                    {"type": "흑점", "count": 5},
                    {"type": "치수 불량", "count": 3},
                ],
                "includes_demo": True,
            },
        },
    )


def test_render_report_pdf_contains_pdf_document() -> None:
    content = render_report_pdf(make_report())

    assert content.startswith(b"%PDF-")
    assert len(content) > 20_000
