from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

ReportCategory = Literal[
    "equipment_issue",
    "quality_report",
    "inspection_done",
    "periodic_weekly",
    "periodic_monthly",
    "other",
]
ReportKind = Literal["general", "weekly", "monthly"]
ReportStatus = Literal["pending", "in_progress", "completed"]

_PERIODIC_KIND = {"periodic_weekly": "weekly", "periodic_monthly": "monthly"}


class Pagination(BaseModel):
    page: int
    page_size: int
    total_items: int
    total_pages: int


class ReportCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body_markdown: str = Field(min_length=1)
    category: ReportCategory
    report_kind: ReportKind = "general"

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("제목을 입력해 주세요.")
        return normalized

    @field_validator("body_markdown")
    @classmethod
    def reject_blank_body(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("본문을 입력해 주세요.")
        return value

    @model_validator(mode="after")
    def match_kind_to_category(self) -> ReportCreateRequest:
        expected = _PERIODIC_KIND.get(self.category, "general")
        if self.report_kind != expected:
            raise ValueError("보고 분류와 보고 종류가 맞지 않습니다.")
        return self


class ReportUpdateRequest(BaseModel):
    version: int = Field(ge=1)
    title: str | None = Field(default=None, min_length=1, max_length=200)
    body_markdown: str | None = Field(default=None, min_length=1)

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("제목을 입력해 주세요.")
        return normalized

    @field_validator("body_markdown")
    @classmethod
    def reject_blank_body(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("본문을 입력해 주세요.")
        return value

    @model_validator(mode="after")
    def require_change(self) -> ReportUpdateRequest:
        if self.title is None and self.body_markdown is None:
            raise ValueError("수정할 필드를 하나 이상 지정해야 합니다.")
        return self


class ReportStatusChangeRequest(BaseModel):
    version: int = Field(ge=1)
    business_status: ReportStatus


class ReportListItem(BaseModel):
    report_id: int
    title: str
    category: ReportCategory
    report_kind: ReportKind
    business_status: ReportStatus
    author_id: int
    author_display_name: str
    version: int
    created_at: datetime
    updated_at: datetime


class ReportDetail(ReportListItem):
    body_markdown: str
    last_editor_id: int | None
    last_editor_display_name: str | None


class ReportListResponse(BaseModel):
    items: list[ReportListItem]
    pagination: Pagination


class ReportRevisionItem(BaseModel):
    version: int
    title: str
    body_markdown: str
    editor_id: int
    editor_display_name: str
    created_at: datetime


class ReportRevisionListResponse(BaseModel):
    items: list[ReportRevisionItem]


class ReportStatusEventItem(BaseModel):
    event_id: int
    before_status: ReportStatus
    after_status: ReportStatus
    actor_id: int
    actor_display_name: str
    created_at: datetime


class ReportStatusEventListResponse(BaseModel):
    items: list[ReportStatusEventItem]
