from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.schemas.report_job import JobState, Pagination


class ConversationCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("대화 제목을 입력해 주세요.")
        return normalized


class ConversationListItem(BaseModel):
    conversation_id: int
    title: str
    turn_count: int
    created_at: datetime
    updated_at: datetime


class ConversationListResponse(BaseModel):
    items: list[ConversationListItem]
    pagination: Pagination


class ChatTurnJob(BaseModel):
    job_id: int
    state: JobState
    accepted_at: datetime
    data_cutoff_at: datetime | None
    finished_at: datetime | None
    error_code: str | None
    safe_error_message: str | None


class AnswerEvidenceItem(BaseModel):
    report_id: int | None
    process_record_id: int | None
    inspection_record_id: int | None
    product_id: int | None
    source_version: int | None
    source_time: datetime | None


class ChatTurnItem(BaseModel):
    turn_id: int
    question: str
    answer: str | None
    answered_at: datetime | None
    created_at: datetime
    data_cutoff_at: datetime | None
    is_demo: bool | None
    job: ChatTurnJob | None
    evidence: list[AnswerEvidenceItem]


class ConversationDetail(ConversationListItem):
    turns: list[ChatTurnItem]


class ChatTurnCreateRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    client_request_key: str = Field(min_length=1, max_length=100)

    @field_validator("question")
    @classmethod
    def strip_question(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("질문을 입력해 주세요.")
        return normalized

    @field_validator("client_request_key")
    @classmethod
    def strip_key(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("요청 키를 입력해 주세요.")
        return normalized


class ChatTurnRefreshRequest(BaseModel):
    client_request_key: str = Field(min_length=1, max_length=100)

    @field_validator("client_request_key")
    @classmethod
    def strip_key(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("요청 키를 입력해 주세요.")
        return normalized


class ChatTurnAcceptedResponse(BaseModel):
    conversation_id: int
    turn_id: int
    job_id: int
    state: JobState
    accepted_at: datetime
    data_cutoff_at: datetime | None
