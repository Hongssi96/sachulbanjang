from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

ScheduleCategory = Literal["inspection", "production", "meeting", "other"]


class Pagination(BaseModel):
    page: int
    page_size: int
    total_items: int
    total_pages: int


def _require_timezone(value: datetime | None) -> datetime | None:
    if value is not None and value.utcoffset() is None:
        raise ValueError("timezone offset is required")
    return value


class ScheduleCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    category: ScheduleCategory
    description: str | None = Field(default=None, max_length=2000)
    all_day: bool
    start_date: date | None = None
    end_date_exclusive: date | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("제목을 입력해 주세요.")
        return normalized

    @field_validator("starts_at", "ends_at")
    @classmethod
    def require_timezone(cls, value: datetime | None) -> datetime | None:
        return _require_timezone(value)

    @model_validator(mode="after")
    def validate_shape(self) -> ScheduleCreateRequest:
        if self.all_day:
            if self.start_date is None or self.end_date_exclusive is None:
                raise ValueError("종일 일정은 시작일과 종료일이 필요합니다.")
            if self.starts_at is not None or self.ends_at is not None:
                raise ValueError("종일 일정에는 시각을 지정할 수 없습니다.")
            if self.end_date_exclusive <= self.start_date:
                raise ValueError("종료일은 시작일보다 뒤여야 합니다.")
        else:
            if self.starts_at is None or self.ends_at is None:
                raise ValueError("시간 지정 일정은 시작·종료 시각이 필요합니다.")
            if self.start_date is not None or self.end_date_exclusive is not None:
                raise ValueError("시간 지정 일정에는 날짜를 지정할 수 없습니다.")
            if self.ends_at <= self.starts_at:
                raise ValueError("종료 시각은 시작 시각보다 뒤여야 합니다.")
        return self


class ScheduleUpdateRequest(BaseModel):
    version: int = Field(ge=1)
    title: str | None = Field(default=None, min_length=1, max_length=200)
    category: ScheduleCategory | None = None
    description: str | None = Field(default=None, max_length=2000)
    all_day: bool | None = None
    start_date: date | None = None
    end_date_exclusive: date | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("제목을 입력해 주세요.")
        return normalized

    @field_validator("starts_at", "ends_at")
    @classmethod
    def require_timezone(cls, value: datetime | None) -> datetime | None:
        return _require_timezone(value)

    @model_validator(mode="after")
    def reject_mixed_representations(self) -> ScheduleUpdateRequest:
        date_fields = {"start_date", "end_date_exclusive"} & self.model_fields_set
        time_fields = {"starts_at", "ends_at"} & self.model_fields_set
        if date_fields and time_fields:
            raise ValueError("날짜와 시각을 함께 보낼 수 없습니다.")
        if not self.model_fields_set - {"version"}:
            raise ValueError("수정할 필드를 하나 이상 지정해야 합니다.")
        return self

    def changes(self) -> dict[str, object]:
        return {
            field: getattr(self, field) for field in self.model_fields_set if field != "version"
        }


class ScheduleItem(BaseModel):
    schedule_id: int
    title: str
    category: ScheduleCategory
    description: str | None
    all_day: bool
    start_date: date | None
    end_date_exclusive: date | None
    starts_at: datetime | None
    ends_at: datetime | None
    author_id: int
    author_display_name: str
    version: int
    created_at: datetime
    updated_at: datetime


class ScheduleListResponse(BaseModel):
    items: list[ScheduleItem]
    pagination: Pagination
