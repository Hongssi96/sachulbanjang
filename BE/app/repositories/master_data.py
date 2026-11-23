from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.master import (
    AppUser,
    Department,
    Equipment,
    Product,
    ProductionLine,
    UserAssignment,
)


class MasterDataRepository:
    """Data access for organization master data and user assignments."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def find_department_by_code(self, code: str) -> Department | None:
        return self._session.scalar(select(Department).where(Department.code == code))

    def add_department(self, department: Department) -> None:
        self._session.add(department)
        self._session.flush()

    def find_production_line(self, department_id: int, code: str) -> ProductionLine | None:
        return self._session.scalar(
            select(ProductionLine).where(
                ProductionLine.department_id == department_id,
                ProductionLine.code == code,
            )
        )

    def add_production_line(self, production_line: ProductionLine) -> None:
        self._session.add(production_line)
        self._session.flush()

    def find_equipment_by_code(self, equipment_code: str) -> Equipment | None:
        return self._session.scalar(
            select(Equipment).where(Equipment.equipment_code == equipment_code)
        )

    def find_user_by_employee_no(self, employee_no: str) -> AppUser | None:
        return self._session.scalar(select(AppUser).where(AppUser.employee_no == employee_no))

    def find_active_assignment(
        self,
        user_id: int,
        *,
        department_id: int | None = None,
        production_line_id: int | None = None,
        equipment_id: int | None = None,
    ) -> UserAssignment | None:
        return self._session.scalar(
            select(UserAssignment).where(
                UserAssignment.user_id == user_id,
                UserAssignment.department_id == department_id,
                UserAssignment.production_line_id == production_line_id,
                UserAssignment.equipment_id == equipment_id,
                UserAssignment.deleted_at.is_(None),
            )
        )

    def add_assignment(self, assignment: UserAssignment) -> None:
        self._session.add(assignment)

    def list_active_departments(self) -> list[Department]:
        return list(
            self._session.scalars(
                select(Department)
                .where(Department.deleted_at.is_(None))
                .order_by(Department.code.asc(), Department.id.asc())
            )
        )

    def list_active_production_lines(self, *, department_id: int | None) -> list[ProductionLine]:
        statement = select(ProductionLine).where(ProductionLine.deleted_at.is_(None))
        if department_id is not None:
            statement = statement.where(ProductionLine.department_id == department_id)
        return list(
            self._session.scalars(
                statement.order_by(
                    ProductionLine.department_id.asc(),
                    ProductionLine.code.asc(),
                    ProductionLine.id.asc(),
                )
            )
        )

    def list_active_equipment(self, *, production_line_id: int | None) -> list[Equipment]:
        statement = select(Equipment).where(Equipment.deleted_at.is_(None))
        if production_line_id is not None:
            statement = statement.where(Equipment.production_line_id == production_line_id)
        return list(
            self._session.scalars(
                statement.order_by(Equipment.equipment_code.asc(), Equipment.id.asc())
            )
        )

    def list_active_products(self, *, query: str | None) -> list[Product]:
        statement = select(Product).where(Product.deleted_at.is_(None))
        if query:
            escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            pattern = f"%{escaped}%"
            statement = statement.where(
                Product.name.ilike(pattern, escape="\\")
                | Product.product_code.ilike(pattern, escape="\\")
            )
        return list(self._session.scalars(statement.order_by(Product.name.asc(), Product.id.asc())))

    def list_assigned_departments(self, user_id: int) -> list[Department]:
        return list(
            self._session.scalars(
                select(Department)
                .join(UserAssignment, UserAssignment.department_id == Department.id)
                .where(
                    UserAssignment.user_id == user_id,
                    UserAssignment.deleted_at.is_(None),
                    Department.deleted_at.is_(None),
                )
                .order_by(Department.code.asc(), Department.id.asc())
            )
        )

    def list_assigned_production_lines(self, user_id: int) -> list[ProductionLine]:
        return list(
            self._session.scalars(
                select(ProductionLine)
                .join(UserAssignment, UserAssignment.production_line_id == ProductionLine.id)
                .where(
                    UserAssignment.user_id == user_id,
                    UserAssignment.deleted_at.is_(None),
                    ProductionLine.deleted_at.is_(None),
                )
                .order_by(ProductionLine.code.asc(), ProductionLine.id.asc())
            )
        )

    def list_assigned_equipment(self, user_id: int) -> list[Equipment]:
        return list(
            self._session.scalars(
                select(Equipment)
                .join(UserAssignment, UserAssignment.equipment_id == Equipment.id)
                .where(
                    UserAssignment.user_id == user_id,
                    UserAssignment.deleted_at.is_(None),
                    Equipment.deleted_at.is_(None),
                )
                .order_by(Equipment.equipment_code.asc(), Equipment.id.asc())
            )
        )
