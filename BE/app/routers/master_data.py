from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db_session
from app.dependencies.auth import get_current_user
from app.models.master import AppUser, Department, Equipment, Product, ProductionLine
from app.repositories.master_data import MasterDataRepository
from app.schemas.master_data import (
    AssignmentResponse,
    DepartmentItem,
    DepartmentListResponse,
    EquipmentItem,
    EquipmentListResponse,
    ProductionLineItem,
    ProductionLineListResponse,
    ProductItem,
    ProductListResponse,
)
from app.services.master_data import MasterDataService

router = APIRouter(tags=["master-data"])


def get_master_data_service(
    session: Annotated[Session, Depends(get_db_session)],
) -> MasterDataService:
    return MasterDataService(MasterDataRepository(session))


def _department_item(department: Department) -> DepartmentItem:
    return DepartmentItem(department_id=department.id, code=department.code, name=department.name)


def _production_line_item(production_line: ProductionLine) -> ProductionLineItem:
    return ProductionLineItem(
        production_line_id=production_line.id,
        department_id=production_line.department_id,
        code=production_line.code,
        name=production_line.name,
    )


def _equipment_item(equipment: Equipment) -> EquipmentItem:
    return EquipmentItem(
        equipment_id=equipment.id,
        equipment_code=equipment.equipment_code,
        name=equipment.name,
        production_line_id=equipment.production_line_id,
    )


def _product_item(product: Product) -> ProductItem:
    return ProductItem(product_id=product.id, product_code=product.product_code, name=product.name)


@router.get("/assignments/me", response_model=AssignmentResponse)
def read_my_assignments(
    user: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[MasterDataService, Depends(get_master_data_service)],
) -> AssignmentResponse:
    assignments = service.get_assignments(user.id)
    return AssignmentResponse(
        departments=[_department_item(item) for item in assignments.departments],
        production_lines=[_production_line_item(item) for item in assignments.production_lines],
        equipment=[_equipment_item(item) for item in assignments.equipment],
    )


@router.get("/departments", response_model=DepartmentListResponse)
def list_departments(
    _: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[MasterDataService, Depends(get_master_data_service)],
) -> DepartmentListResponse:
    return DepartmentListResponse(
        items=[_department_item(department) for department in service.list_departments()]
    )


@router.get("/production-lines", response_model=ProductionLineListResponse)
def list_production_lines(
    _: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[MasterDataService, Depends(get_master_data_service)],
    department_id: Annotated[int | None, Query(gt=0)] = None,
) -> ProductionLineListResponse:
    lines = service.list_production_lines(department_id=department_id)
    return ProductionLineListResponse(items=[_production_line_item(line) for line in lines])


@router.get("/equipment", response_model=EquipmentListResponse)
def list_equipment(
    _: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[MasterDataService, Depends(get_master_data_service)],
    production_line_id: Annotated[int | None, Query(gt=0)] = None,
) -> EquipmentListResponse:
    equipment = service.list_equipment(production_line_id=production_line_id)
    return EquipmentListResponse(items=[_equipment_item(item) for item in equipment])


@router.get("/products", response_model=ProductListResponse)
def list_products(
    _: Annotated[AppUser, Depends(get_current_user)],
    service: Annotated[MasterDataService, Depends(get_master_data_service)],
    q: Annotated[str | None, Query(max_length=100)] = None,
) -> ProductListResponse:
    products = service.list_products(query=q)
    return ProductListResponse(items=[_product_item(product) for product in products])
