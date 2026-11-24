from datetime import date, datetime
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
JobState = Literal[
    "accepted",
    "querying",
    "writing",
    "succeeded",
    "failed",
    "interrupted",
    "cancelled",
]

_PERIODIC_KIND = {"periodic_weekly": "weekly", "periodic_monthly": "monthly"}


class Pagination(BaseModel):
    page: int
    page_size: int
    total_items: int
    total_pages: int


class ReportJobPeriod(BaseModel):
    from_: date | None = Field(default=None, alias="from")
    to: date | None = None

    model_config = {"populate_by_name": True}

    @model_validator(mode="after")
    def check_order(self) -> ReportJobPeriod:
        if self.from_ is not None and self.to is not None and self.from_ > self.to:
            raise ValueError("기간의 시작일은 종료일보다 늦을 수 없습니다.")
        return self


class ReportJobTargets(BaseModel):
    department_ids: list[int] = Field(default_factory=list)
    production_line_ids: list[int] = Field(default_factory=list)
    equipment_ids: list[int] = Field(default_factory=list)

    @field_validator("department_ids", "production_line_ids", "equipment_ids")
    @classmethod
    def reject_non_positive(cls, value: list[int]) -> list[int]:
        if any(item < 1 for item in value):
            raise ValueError("대상 ID는 1 이상이어야 합니다.")
        return value


class ReportConditionRequest(BaseModel):
    report_kind: ReportKind = "general"
    category: ReportCategory
    period: ReportJobPeriod = Field(default_factory=ReportJobPeriod)
    targets: ReportJobTargets = Field(default_factory=ReportJobTargets)

    @model_validator(mode="after")
    def match_kind_to_category(self) -> ReportConditionRequest:
        expected = _PERIODIC_KIND.get(self.category, "general")
        if self.report_kind != expected:
            raise ValueError("보고 분류와 보고 종류가 맞지 않습니다.")
        return self

    def payload(self) -> dict[str, object]:
        return {
            "report_kind": self.report_kind,
            "category": self.category,
            "period": {
                "from": self.period.from_.isoformat() if self.period.from_ else None,
                "to": self.period.to.isoformat() if self.period.to else None,
            },
            "targets": {
                "department_ids": sorted(self.targets.department_ids),
                "production_line_ids": sorted(self.targets.production_line_ids),
                "equipment_ids": sorted(self.targets.equipment_ids),
            },
        }


class ReportJobCreateRequest(ReportConditionRequest):
    client_request_key: str = Field(min_length=1, max_length=100)
    force_regenerate: bool = False

    @field_validator("client_request_key")
    @classmethod
    def strip_key(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("요청 키를 입력해 주세요.")
        return normalized


class ReportDuplicateCheckRequest(ReportConditionRequest):
    pass


class JobRetryRequest(BaseModel):
    client_request_key: str = Field(min_length=1, max_length=100)

    @field_validator("client_request_key")
    @classmethod
    def strip_key(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("요청 키를 입력해 주세요.")
        return normalized


class ReportJobAcceptedResponse(BaseModel):
    job_id: int
    state: JobState
    accepted_at: datetime
    data_cutoff_at: datetime | None
    report_id: int | None = None


class JobListItem(BaseModel):
    job_id: int
    kind: Literal["report", "chat"]
    state: JobState
    client_request_key: str
    accepted_at: datetime
    data_cutoff_at: datetime | None
    finished_at: datetime | None
    error_code: str | None
    safe_error_message: str | None
    retry_of_id: int | None
    attempt_count: int
    report_id: int | None


class JobDetail(JobListItem):
    request_payload: dict[str, object]
    claimed_at: datetime | None
    heartbeat_at: datetime | None
    lease_expires_at: datetime | None


class JobListResponse(BaseModel):
    items: list[JobListItem]
    pagination: Pagination


class ReportDuplicateItem(BaseModel):
    report_id: int
    title: str
    category: ReportCategory
    report_kind: ReportKind
    business_status: Literal["pending", "in_progress", "completed"]
    author_id: int
    author_display_name: str
    created_at: datetime


class ReportDuplicateCheckResponse(BaseModel):
    has_duplicate: bool
    reusable_report_id: int | None
    items: list[ReportDuplicateItem]
