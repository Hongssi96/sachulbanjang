from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models.master import Department, ProductionLine, UserAssignment
from app.repositories.master_data import MasterDataRepository
from app.schemas.master_data_seed import MasterDataSeedRequest


class MasterDataSeedError(Exception):
    """Raised when initial organization or assignment data cannot be loaded."""


@dataclass(frozen=True)
class MasterDataSeedResult:
    departments_created: int
    production_lines_created: int
    equipment_linked: int
    assignments_created: int


class MasterDataSeedService:
    """Load organization master data and user assignments from one request.

    Re-running the same request creates nothing new and does not overwrite values
    that were already set(DEC-195).
    """

    def __init__(self, session: Session, repository: MasterDataRepository) -> None:
        self._session = session
        self._repository = repository

    def seed(self, request: MasterDataSeedRequest) -> MasterDataSeedResult:
        departments_created = 0
        lines_created = 0
        equipment_linked = 0
        assignments_created = 0

        departments: dict[str, Department] = {}
        for department_item in request.departments:
            department = self._repository.find_department_by_code(department_item.code)
            if department is None:
                department = Department(code=department_item.code, name=department_item.name)
                self._repository.add_department(department)
                departments_created += 1
            departments[department_item.code] = department

        lines: dict[tuple[str, str], ProductionLine] = {}
        for line_item in request.production_lines:
            department = self._resolve_department(departments, line_item.department_code)
            line = self._repository.find_production_line(department.id, line_item.code)
            if line is None:
                line = ProductionLine(
                    department_id=department.id, code=line_item.code, name=line_item.name
                )
                self._repository.add_production_line(line)
                lines_created += 1
            lines[(line_item.department_code, line_item.code)] = line
            for equipment_code in line_item.equipment_codes:
                equipment = self._repository.find_equipment_by_code(equipment_code)
                if equipment is None:
                    raise MasterDataSeedError(f"equipment not found: {equipment_code}")
                if equipment.production_line_id is None:
                    equipment.production_line_id = line.id
                    equipment_linked += 1
                elif equipment.production_line_id != line.id:
                    raise MasterDataSeedError(
                        f"equipment {equipment_code} already belongs to another line"
                    )

        for assignment_item in request.assignments:
            user = self._repository.find_user_by_employee_no(assignment_item.employee_no)
            if user is None or user.deleted_at is not None:
                raise MasterDataSeedError(f"active user not found: {assignment_item.employee_no}")

            for department_code in assignment_item.department_codes:
                department = self._resolve_department(departments, department_code)
                if (
                    self._repository.find_active_assignment(user.id, department_id=department.id)
                    is None
                ):
                    self._repository.add_assignment(
                        UserAssignment(user_id=user.id, department_id=department.id)
                    )
                    assignments_created += 1

            for line_ref in assignment_item.production_lines:
                department = self._resolve_department(departments, line_ref.department_code)
                line = lines.get((line_ref.department_code, line_ref.code))
                if line is None:
                    line = self._repository.find_production_line(department.id, line_ref.code)
                if line is None:
                    raise MasterDataSeedError(
                        f"production line not found: {line_ref.department_code}/{line_ref.code}"
                    )
                if (
                    self._repository.find_active_assignment(user.id, production_line_id=line.id)
                    is None
                ):
                    self._repository.add_assignment(
                        UserAssignment(user_id=user.id, production_line_id=line.id)
                    )
                    assignments_created += 1

            for equipment_code in assignment_item.equipment_codes:
                equipment = self._repository.find_equipment_by_code(equipment_code)
                if equipment is None:
                    raise MasterDataSeedError(f"equipment not found: {equipment_code}")
                if (
                    self._repository.find_active_assignment(user.id, equipment_id=equipment.id)
                    is None
                ):
                    self._repository.add_assignment(
                        UserAssignment(user_id=user.id, equipment_id=equipment.id)
                    )
                    assignments_created += 1

        self._session.commit()
        return MasterDataSeedResult(
            departments_created=departments_created,
            production_lines_created=lines_created,
            equipment_linked=equipment_linked,
            assignments_created=assignments_created,
        )

    def _resolve_department(self, departments: dict[str, Department], code: str) -> Department:
        department = departments.get(code)
        if department is None:
            department = self._repository.find_department_by_code(code)
        if department is None:
            raise MasterDataSeedError(f"department not found: {code}")
        departments.setdefault(code, department)
        return department
