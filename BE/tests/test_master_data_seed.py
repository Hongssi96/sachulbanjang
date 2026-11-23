import json
from datetime import UTC, datetime, time
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from app.commands.seed_master_data import build_parser, load_request
from app.models.master import AppUser, Department, Equipment, ProductionLine, UserAssignment
from app.repositories.master_data import MasterDataRepository
from app.schemas.master_data_seed import MasterDataSeedRequest
from app.services.master_data_seed import MasterDataSeedError, MasterDataSeedService
from sqlalchemy.orm import Session


class FakeMasterDataRepository(MasterDataRepository):
    def __init__(
        self,
        *,
        users: list[AppUser] | None = None,
        equipment: list[Equipment] | None = None,
    ) -> None:
        self.departments: list[Department] = []
        self.production_lines: list[ProductionLine] = []
        self.equipment: list[Equipment] = list(equipment or [])
        self.users: list[AppUser] = list(users or [])
        self.assignments: list[UserAssignment] = []

    def find_department_by_code(self, code: str) -> Department | None:
        return next((item for item in self.departments if item.code == code), None)

    def add_department(self, department: Department) -> None:
        department.id = len(self.departments) + 1
        self.departments.append(department)

    def find_production_line(self, department_id: int, code: str) -> ProductionLine | None:
        return next(
            (
                item
                for item in self.production_lines
                if item.department_id == department_id and item.code == code
            ),
            None,
        )

    def add_production_line(self, production_line: ProductionLine) -> None:
        production_line.id = len(self.production_lines) + 1
        self.production_lines.append(production_line)

    def find_equipment_by_code(self, equipment_code: str) -> Equipment | None:
        return next(
            (item for item in self.equipment if item.equipment_code == equipment_code), None
        )

    def find_user_by_employee_no(self, employee_no: str) -> AppUser | None:
        return next((item for item in self.users if item.employee_no == employee_no), None)

    def find_active_assignment(
        self,
        user_id: int,
        *,
        department_id: int | None = None,
        production_line_id: int | None = None,
        equipment_id: int | None = None,
    ) -> UserAssignment | None:
        return next(
            (
                item
                for item in self.assignments
                if item.user_id == user_id
                and item.department_id == department_id
                and item.production_line_id == production_line_id
                and item.equipment_id == equipment_id
                and item.deleted_at is None
            ),
            None,
        )

    def add_assignment(self, assignment: UserAssignment) -> None:
        self.assignments.append(assignment)


def make_user(employee_no: str = "W9001", *, deleted: bool = False) -> AppUser:
    return AppUser(
        id=1,
        employee_no=employee_no,
        display_name="고용자",
        password_hash="unused",
        role="worker",
        must_change_password=False,
        shift_start_local=time(9, 0),
        shift_end_local=time(18, 0),
        deleted_at=datetime.now(UTC) if deleted else None,
    )


def make_equipment(equipment_code: str = "S01", line_id: int | None = None) -> Equipment:
    return Equipment(id=1, equipment_code=equipment_code, name="사출기", production_line_id=line_id)


def make_request(**overrides: object) -> MasterDataSeedRequest:
    payload: dict[str, object] = {
        "departments": [{"code": "D1", "name": "생산1부"}],
        "production_lines": [
            {"department_code": "D1", "code": "L1", "name": "1라인", "equipment_codes": ["S01"]}
        ],
        "assignments": [
            {
                "employee_no": "W9001",
                "department_codes": ["D1"],
                "production_lines": [{"department_code": "D1", "code": "L1"}],
                "equipment_codes": ["S01"],
            }
        ],
    }
    payload.update(overrides)
    return MasterDataSeedRequest.model_validate(payload)


def build_service(
    repository: FakeMasterDataRepository,
) -> tuple[MasterDataSeedService, MagicMock]:
    session = MagicMock(spec=Session)
    return MasterDataSeedService(session, repository), session


def test_seed_creates_organization_and_assignments() -> None:
    repository = FakeMasterDataRepository(users=[make_user()], equipment=[make_equipment()])
    service, session = build_service(repository)

    result = service.seed(make_request())

    assert result.departments_created == 1
    assert result.production_lines_created == 1
    assert result.equipment_linked == 1
    assert result.assignments_created == 3
    assert repository.equipment[0].production_line_id == repository.production_lines[0].id
    session.commit.assert_called_once_with()


def test_seed_is_idempotent() -> None:
    repository = FakeMasterDataRepository(users=[make_user()], equipment=[make_equipment()])
    service, session = build_service(repository)
    service.seed(make_request())
    session.commit.reset_mock()

    result = service.seed(make_request())

    assert result.departments_created == 0
    assert result.production_lines_created == 0
    assert result.equipment_linked == 0
    assert result.assignments_created == 0
    assert len(repository.assignments) == 3
    session.commit.assert_called_once_with()


def test_seed_keeps_existing_equipment_line() -> None:
    repository = FakeMasterDataRepository(users=[make_user()], equipment=[make_equipment()])
    repository.departments.append(Department(id=1, code="D1", name="기존 부서"))
    repository.production_lines.append(
        ProductionLine(id=1, department_id=1, code="L1", name="기존 라인")
    )
    repository.equipment[0].production_line_id = 99
    service, session = build_service(repository)

    with pytest.raises(MasterDataSeedError, match="another line"):
        service.seed(make_request())

    session.commit.assert_not_called()


def test_seed_rejects_missing_equipment() -> None:
    repository = FakeMasterDataRepository(users=[make_user()])
    service, session = build_service(repository)

    with pytest.raises(MasterDataSeedError, match="equipment not found"):
        service.seed(make_request())

    session.commit.assert_not_called()


def test_seed_rejects_missing_or_deleted_user() -> None:
    repository = FakeMasterDataRepository(users=[], equipment=[make_equipment()])
    service, _ = build_service(repository)
    with pytest.raises(MasterDataSeedError, match="active user not found"):
        service.seed(make_request())

    repository = FakeMasterDataRepository(
        users=[make_user(deleted=True)], equipment=[make_equipment()]
    )
    service, _ = build_service(repository)
    with pytest.raises(MasterDataSeedError, match="active user not found"):
        service.seed(make_request())


def test_seed_rejects_unknown_department_in_assignment() -> None:
    repository = FakeMasterDataRepository(users=[make_user()], equipment=[make_equipment()])
    service, _ = build_service(repository)

    with pytest.raises(MasterDataSeedError, match="department not found"):
        service.seed(make_request(departments=[], production_lines=[]))


def test_parser_requires_file() -> None:
    with pytest.raises(SystemExit):
        build_parser().parse_args([])

    args = build_parser().parse_args(["--file", "master.json"])
    assert args.file == "master.json"


def test_load_request_reads_json(tmp_path: Path) -> None:
    path = tmp_path / "master.json"
    path.write_text(
        json.dumps({"departments": [{"code": "D1", "name": "생산1부"}]}), encoding="utf-8"
    )

    request = load_request(str(path))

    assert request.departments[0].code == "D1"
    assert request.production_lines == []
