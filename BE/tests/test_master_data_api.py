from datetime import time
from unittest.mock import MagicMock

from app.core.config import Settings
from app.dependencies.auth import get_current_user
from app.main import create_app
from app.models.master import AppUser, Department, Equipment, Product, ProductionLine
from app.routers.master_data import get_master_data_service
from app.services.master_data import MasterDataService
from fastapi import FastAPI
from fastapi.testclient import TestClient


def make_settings() -> Settings:
    return Settings(
        _env_file=None,
        database_url="postgresql+psycopg://user:password@localhost/database",
        jwt_secret="test-secret-that-is-at-least-32-characters",
    )


def make_user(role: str = "worker") -> AppUser:
    return AppUser(
        id=1,
        employee_no="E001",
        display_name="테스트 사용자",
        password_hash="unused",
        role=role,
        must_change_password=False,
        shift_start_local=time(9, 0),
        shift_end_local=time(18, 0),
        failed_login_count=0,
        version=1,
    )


def make_application(service: MasterDataService | None = None) -> FastAPI:
    application = create_app(
        settings=make_settings(),
        migration_checker=lambda engine, path: None,
    )
    application.dependency_overrides[get_current_user] = make_user
    if service is not None:
        application.dependency_overrides[get_master_data_service] = lambda: service
    return application


def test_master_lists_require_authentication() -> None:
    application = create_app(
        settings=make_settings(),
        migration_checker=lambda engine, path: None,
    )

    with TestClient(application) as client:
        response = client.get("/api/v1/departments")

    assert response.status_code == 401
    assert response.json()["code"] == "AUTHENTICATION_REQUIRED"


def test_worker_reads_master_lists() -> None:
    service = MagicMock(spec=MasterDataService)
    service.list_departments.return_value = [Department(id=1, code="D1", name="생산1부")]
    service.list_production_lines.return_value = [
        ProductionLine(id=2, department_id=1, code="L1", name="1라인")
    ]
    service.list_equipment.return_value = [
        Equipment(id=3, equipment_code="S01", name="사출기 1", production_line_id=2)
    ]
    service.list_products.return_value = [Product(id=4, product_code=None, name="시연 제품")]
    application = make_application(service)

    with TestClient(application) as client:
        departments = client.get("/api/v1/departments")
        lines = client.get("/api/v1/production-lines", params={"department_id": 1})
        equipment = client.get("/api/v1/equipment", params={"production_line_id": 2})
        products = client.get("/api/v1/products", params={"q": " 시연 "})

    assert departments.json() == {"items": [{"department_id": 1, "code": "D1", "name": "생산1부"}]}
    assert lines.json() == {
        "items": [
            {
                "production_line_id": 2,
                "department_id": 1,
                "code": "L1",
                "name": "1라인",
            }
        ]
    }
    assert equipment.json() == {
        "items": [
            {
                "equipment_id": 3,
                "equipment_code": "S01",
                "name": "사출기 1",
                "production_line_id": 2,
            }
        ]
    }
    assert products.json() == {
        "items": [{"product_id": 4, "product_code": None, "name": "시연 제품"}]
    }
    service.list_production_lines.assert_called_once_with(department_id=1)
    service.list_equipment.assert_called_once_with(production_line_id=2)
    service.list_products.assert_called_once_with(query=" 시연 ")


def test_master_lists_reject_invalid_filters() -> None:
    service = MagicMock(spec=MasterDataService)
    application = make_application(service)

    with TestClient(application) as client:
        bad_department = client.get("/api/v1/production-lines", params={"department_id": 0})
        bad_equipment = client.get("/api/v1/equipment", params={"production_line_id": 0})

    assert bad_department.status_code == 422
    assert bad_equipment.status_code == 422
    service.list_production_lines.assert_not_called()
    service.list_equipment.assert_not_called()
