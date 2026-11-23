from pydantic import BaseModel


class DepartmentItem(BaseModel):
    department_id: int
    code: str
    name: str


class ProductionLineItem(BaseModel):
    production_line_id: int
    department_id: int
    code: str
    name: str


class EquipmentItem(BaseModel):
    equipment_id: int
    equipment_code: str
    name: str
    production_line_id: int | None


class ProductItem(BaseModel):
    product_id: int
    product_code: str | None
    name: str


class DepartmentListResponse(BaseModel):
    items: list[DepartmentItem]


class ProductionLineListResponse(BaseModel):
    items: list[ProductionLineItem]


class EquipmentListResponse(BaseModel):
    items: list[EquipmentItem]


class ProductListResponse(BaseModel):
    items: list[ProductItem]


class AssignmentResponse(BaseModel):
    departments: list[DepartmentItem]
    production_lines: list[ProductionLineItem]
    equipment: list[EquipmentItem]
