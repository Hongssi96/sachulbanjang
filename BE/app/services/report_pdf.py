from __future__ import annotations

import html
from dataclasses import dataclass
from datetime import datetime
from io import BytesIO
from pathlib import Path

import matplotlib

matplotlib.use("Agg")

from matplotlib import font_manager
from matplotlib import pyplot as plt
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Image,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.core.datetime_labels import korean_kst_label
from app.models.report import Report, ReportRevision

_ASSET_DIR = Path(__file__).resolve().parents[1] / "assets" / "fonts"
_REGULAR_FONT = _ASSET_DIR / "Pretendard-Regular.ttf"
_BOLD_FONT = _ASSET_DIR / "Pretendard-Bold.ttf"
_FONT_NAME = "Pretendard"
_FONT_BOLD_NAME = "Pretendard-Bold"

_PLUM = colors.HexColor("#635B85")
_MINT = colors.HexColor("#61E2A6")
_CORAL = colors.HexColor("#D95F70")
_WARM_CLOUD = colors.HexColor("#F5F5F2")
_TEXT = colors.HexColor("#29263F")
_BORDER_HEX = "#E2E2E8"
_CORAL_HEX = "#D95F70"
_TEXT_HEX = "#29263F"


class ReportPdfError(Exception):
    """Raised when a report PDF cannot be rendered safely."""


class ReportChartError(Exception):
    """Raised when a stored report snapshot chart cannot be rendered."""


@dataclass(frozen=True)
class ReportPdfDocument:
    title: str
    body_markdown: str
    generation_snapshot: dict[str, object] | None
    generation_data_cutoff_at: datetime | None = None


def _cutoff_label(report: Report | ReportPdfDocument) -> str:
    """Prefer the stored Korean label, then format the cutoff instant."""
    snapshot = report.generation_snapshot or {}
    label = snapshot.get("data_cutoff_label")
    if isinstance(label, str) and label:
        return label
    cutoff = report.generation_data_cutoff_at
    if cutoff is not None:
        return korean_kst_label(cutoff)
    raw = snapshot.get("data_cutoff_at")
    if isinstance(raw, str) and raw:
        try:
            return korean_kst_label(datetime.fromisoformat(raw))
        except ValueError:
            return raw
    return "-"


def render_report_revision_pdf(report: Report, revision: ReportRevision) -> bytes:
    return render_report_pdf(
        ReportPdfDocument(
            title=revision.title,
            body_markdown=revision.body_markdown,
            generation_snapshot=report.generation_snapshot,
            generation_data_cutoff_at=report.generation_data_cutoff_at,
        )
    )


def render_report_pdf(report: Report | ReportPdfDocument) -> bytes:
    _register_fonts()
    output = BytesIO()
    document = SimpleDocTemplate(
        output,
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=20 * mm,
        bottomMargin=18 * mm,
        title=report.title,
        author="사출반장",
    )
    styles = _styles()
    story: list[Flowable] = [
        Paragraph(html.escape(report.title), styles["ReportTitle"]),
        Spacer(1, 5 * mm),
    ]
    snapshot = report.generation_snapshot
    if snapshot is not None:
        story.extend(_snapshot_story(report, snapshot, styles))
        try:
            chart = render_report_defect_chart(report)
        except ReportChartError as error:
            raise ReportPdfError("보고서 그래프를 생성할 수 없습니다.") from error
        if chart is not None:
            story.extend(
                [
                    Spacer(1, 4 * mm),
                    Paragraph("불량 유형 분포", styles["Heading2"]),
                    Image(BytesIO(chart), width=160 * mm, height=72 * mm),
                    Paragraph(
                        "단위: 건 · 보고서 생성 시점의 저장 집계 데이터를 기준으로 작성",
                        styles["Caption"],
                    ),
                    PageBreak(),
                ]
            )
    story.extend(
        [
            Paragraph("AI 분석 코멘트", styles["Heading1"]),
            Paragraph(
                "아래 내용은 집계된 생산·검사 데이터를 바탕으로 AI가 작성한 분석입니다.",
                styles["Caption"],
            ),
            Spacer(1, 2 * mm),
            *_markdown_story(report.body_markdown, styles),
        ]
    )
    try:
        document.build(story, onFirstPage=_page_decorations, onLaterPages=_page_decorations)
    except Exception as error:
        raise ReportPdfError("보고서 PDF를 생성할 수 없습니다.") from error
    return output.getvalue()


def render_report_defect_chart(report: Report | ReportPdfDocument) -> bytes | None:
    snapshot = report.generation_snapshot
    if snapshot is None:
        return None
    try:
        chart = _defect_chart(snapshot)
    except Exception as error:
        raise ReportChartError("불량 유형 그래프를 생성할 수 없습니다.") from error
    return None if chart is None else chart.getvalue()


def _register_fonts() -> None:
    if not _REGULAR_FONT.is_file() or not _BOLD_FONT.is_file():
        raise ReportPdfError("PDF 한글 글꼴을 찾을 수 없습니다.")
    if _FONT_NAME not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont(_FONT_NAME, str(_REGULAR_FONT)))
        pdfmetrics.registerFont(TTFont(_FONT_BOLD_NAME, str(_BOLD_FONT)))


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "ReportTitle": ParagraphStyle(
            "ReportTitle",
            parent=base["Title"],
            fontName=_FONT_BOLD_NAME,
            fontSize=22,
            leading=30,
            textColor=_TEXT,
            alignment=TA_CENTER,
            spaceAfter=8,
        ),
        "Heading1": ParagraphStyle(
            "Heading1",
            parent=base["Heading1"],
            fontName=_FONT_BOLD_NAME,
            fontSize=16,
            leading=22,
            textColor=_PLUM,
            spaceBefore=12,
            spaceAfter=7,
        ),
        "Heading2": ParagraphStyle(
            "Heading2",
            parent=base["Heading2"],
            fontName=_FONT_BOLD_NAME,
            fontSize=13,
            leading=19,
            textColor=_TEXT,
            spaceBefore=10,
            spaceAfter=5,
        ),
        "Body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontName=_FONT_NAME,
            fontSize=10.5,
            leading=17,
            textColor=_TEXT,
            spaceAfter=5,
        ),
        "Bullet": ParagraphStyle(
            "Bullet",
            parent=base["BodyText"],
            fontName=_FONT_NAME,
            fontSize=10.5,
            leading=17,
            leftIndent=10,
            firstLineIndent=-7,
            textColor=_TEXT,
            spaceAfter=3,
        ),
        "Caption": ParagraphStyle(
            "Caption",
            parent=base["BodyText"],
            fontName=_FONT_NAME,
            fontSize=9,
            leading=13,
            textColor=colors.HexColor("#6E6B7D"),
            spaceAfter=4,
        ),
        "TableHeader": ParagraphStyle(
            "TableHeader",
            parent=base["BodyText"],
            fontName=_FONT_BOLD_NAME,
            fontSize=9.5,
            leading=14,
            textColor=_TEXT,
        ),
        "TableCell": ParagraphStyle(
            "TableCell",
            parent=base["BodyText"],
            fontName=_FONT_NAME,
            fontSize=9.5,
            leading=14,
            textColor=_TEXT,
        ),
    }


def _snapshot_story(
    report: Report | ReportPdfDocument,
    snapshot: dict[str, object],
    styles: dict[str, ParagraphStyle],
) -> list[Flowable]:
    period = _mapping(snapshot.get("period"))
    summary = _mapping(snapshot.get("summary"))
    equipment = snapshot.get("resolved_equipment")
    equipment_count = len(equipment) if isinstance(equipment, list) else 0
    period_label = f"{period.get('from') or '전체'} ~ {period.get('to') or '현재'}"
    rows = [
        ["집계 기간", period_label, "대상 설비", f"{equipment_count}대"],
        [
            "생산 기록",
            f"{summary.get('production_record_count', 0)}건",
            "검사 기록",
            f"{summary.get('inspected_count', 0)}건",
        ],
        [
            "양품 / 불량",
            f"{summary.get('good_count', 0)} / {summary.get('defect_count', 0)}",
            "불량률",
            _rate_label(summary.get("defect_rate_percent")),
        ],
        [
            "집계 기준 시각",
            _cutoff_label(report),
            "시연 데이터",
            "포함" if summary.get("includes_demo") else "미포함",
        ],
    ]
    table = Table(rows, colWidths=[28 * mm, 53 * mm, 28 * mm, 53 * mm])
    table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), _FONT_NAME),
                ("FONTNAME", (0, 0), (0, -1), _FONT_BOLD_NAME),
                ("FONTNAME", (2, 0), (2, -1), _FONT_BOLD_NAME),
                ("BACKGROUND", (0, 0), (0, -1), _WARM_CLOUD),
                ("BACKGROUND", (2, 0), (2, -1), _WARM_CLOUD),
                ("TEXTCOLOR", (0, 0), (-1, -1), _TEXT),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D9D7E3")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    return [Paragraph("집계 요약", styles["Heading2"]), table]


def _markdown_story(markdown: str, styles: dict[str, ParagraphStyle]) -> list[Flowable]:
    story: list[Flowable] = []
    lines = markdown.splitlines()
    line_index = 0
    while line_index < len(lines):
        raw_line = lines[line_index]
        line = raw_line.strip()
        if _is_markdown_table_start(lines, line_index):
            rows: list[list[str]] = [_parse_markdown_table_row(line)]
            line_index += 2
            while line_index < len(lines) and _is_markdown_table_row(lines[line_index]):
                rows.append(_parse_markdown_table_row(lines[line_index].strip()))
                line_index += 1
            story.extend([_markdown_table(rows, styles), Spacer(1, 2.5 * mm)])
            continue
        if not line:
            story.append(Spacer(1, 2.5 * mm))
        elif line.startswith("## "):
            story.append(Paragraph(html.escape(line[3:]), styles["Heading1"]))
        elif line.startswith("### "):
            story.append(Paragraph(html.escape(line[4:]), styles["Heading2"]))
        elif line.startswith("# "):
            story.append(Paragraph(html.escape(line[2:]), styles["Heading1"]))
        elif line.startswith(("- ", "* ")):
            story.append(Paragraph(f"- {html.escape(line[2:])}", styles["Bullet"]))
        else:
            story.append(Paragraph(html.escape(line), styles["Body"]))
        line_index += 1
    return story


def _is_markdown_table_start(lines: list[str], line_index: int) -> bool:
    if line_index + 1 >= len(lines):
        return False
    header = _parse_markdown_table_row(lines[line_index].strip())
    separator = _parse_markdown_table_row(lines[line_index + 1].strip())
    return (
        len(header) >= 2
        and len(header) == len(separator)
        and all(_is_markdown_table_separator(cell) for cell in separator)
    )


def _is_markdown_table_row(line: str) -> bool:
    return len(_parse_markdown_table_row(line.strip())) >= 2


def _parse_markdown_table_row(line: str) -> list[str]:
    if "|" not in line:
        return []
    content = line.strip()
    if content.startswith("|"):
        content = content[1:]
    if content.endswith("|"):
        content = content[:-1]
    return [cell.strip() for cell in content.split("|")]


def _is_markdown_table_separator(cell: str) -> bool:
    stripped = cell.strip(":")
    return len(stripped) >= 3 and set(stripped) == {"-"}


def _markdown_table(rows: list[list[str]], styles: dict[str, ParagraphStyle]) -> Table:
    column_count = len(rows[0])
    normalized_rows = [row[:column_count] + [""] * (column_count - len(row)) for row in rows]
    cells = [
        [
            Paragraph(html.escape(value), styles["TableHeader" if row_index == 0 else "TableCell"])
            for value in row
        ]
        for row_index, row in enumerate(normalized_rows)
    ]
    table = Table(cells, colWidths=[162 * mm / column_count] * column_count, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), _WARM_CLOUD),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D9D7E3")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return table


def _defect_chart(snapshot: dict[str, object]) -> BytesIO | None:
    summary = _mapping(snapshot.get("summary"))
    raw_types = summary.get("defect_types")
    if not isinstance(raw_types, list) or not raw_types:
        return None
    labels: list[str] = []
    values: list[int] = []
    for item in raw_types:
        if not isinstance(item, dict):
            continue
        label = item.get("type")
        count = item.get("count")
        if isinstance(label, str) and isinstance(count, int) and count > 0:
            labels.append(label)
            values.append(count)
    if not values:
        return None
    sorted_items = sorted(zip(labels, values, strict=True), key=lambda item: item[1], reverse=True)
    labels = [item[0] for item in sorted_items]
    values = [item[1] for item in sorted_items]

    font = font_manager.FontProperties(fname=str(_REGULAR_FONT), size=12)
    bold_font = font_manager.FontProperties(fname=str(_BOLD_FONT), size=12)
    figure, axis = plt.subplots(figsize=(8.2, 3.15), dpi=150)
    figure.patch.set_facecolor("white")
    axis.set_facecolor("white")

    bar_height = 0.46
    max_value = max(values)
    axis.set_xlim(0, max_value * 1.2)
    axis.set_ylim(-0.65, len(values) - 0.35)
    axis.barh(
        range(len(values)),
        values,
        height=bar_height,
        color=_CORAL_HEX,
        edgecolor="none",
        zorder=3,
    )
    for position, value in enumerate(values):
        axis.text(
            value + max_value * 0.025,
            position,
            f"{value:,}건",
            va="center",
            ha="left",
            color=_TEXT_HEX,
            fontproperties=bold_font,
        )

    axis.set_yticks(range(len(labels)), labels=labels, fontproperties=font)
    axis.invert_yaxis()
    axis.set_axisbelow(True)
    axis.xaxis.grid(True, color=_BORDER_HEX, linewidth=0.8)
    axis.tick_params(axis="y", colors=_TEXT_HEX, length=0, pad=12)
    axis.tick_params(axis="x", colors=_TEXT_HEX, labelsize=9, length=0, pad=6)
    for label in axis.get_xticklabels():
        label.set_fontproperties(font)
    axis.spines[["top", "right", "left", "bottom"]].set_visible(False)
    figure.subplots_adjust(left=0.2, right=0.93, top=0.94, bottom=0.13)
    image = BytesIO()
    figure.savefig(image, format="png", transparent=False, bbox_inches="tight")
    plt.close(figure)
    image.seek(0)
    return image


def _mapping(value: object) -> dict[str, object]:
    return value if isinstance(value, dict) else {}


def _rate_label(value: object) -> str:
    return "-" if value is None else f"{value}%"


def _page_decorations(canvas: Canvas, document: BaseDocTemplate) -> None:
    canvas.saveState()
    canvas.setStrokeColor(_MINT)
    canvas.setLineWidth(2)
    canvas.line(18 * mm, A4[1] - 13 * mm, A4[0] - 18 * mm, A4[1] - 13 * mm)
    canvas.setFillColor(_TEXT)
    canvas.setFont(_FONT_NAME, 8)
    canvas.drawString(18 * mm, 10 * mm, "사출반장 업무 보고서")
    canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"{document.page} 페이지")
    canvas.restoreState()
