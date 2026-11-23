from pydantic import BaseModel, Field, field_validator


class SeedDepartment(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=100)

    @field_validator("code", "name")
    @classmethod
    def reject_blank(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("공백만 입력할 수 없습니다.")
        return normalized


class SeedProductionLine(BaseModel):
    department_code: str = Field(min_length=1, max_length=50)
    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=100)
    equipment_codes: list[str] = Field(default_factory=list)

    @field_validator("department_code", "code", "name")
    @classmethod
    def reject_blank(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("공백만 입력할 수 없습니다.")
        return normalized


class SeedAssignmentLine(BaseModel):
    department_code: str = Field(min_length=1, max_length=50)
    code: str = Field(min_length=1, max_length=50)


class SeedAssignment(BaseModel):
    employee_no: str = Field(min_length=1, max_length=50)
    department_codes: list[str] = Field(default_factory=list)
    production_lines: list[SeedAssignmentLine] = Field(default_factory=list)
    equipment_codes: list[str] = Field(default_factory=list)

    @field_validator("employee_no")
    @classmethod
    def reject_blank(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("공백만 입력할 수 없습니다.")
        return normalized


class MasterDataSeedRequest(BaseModel):
    departments: list[SeedDepartment] = Field(default_factory=list)
    production_lines: list[SeedProductionLine] = Field(default_factory=list)
    assignments: list[SeedAssignment] = Field(default_factory=list)
