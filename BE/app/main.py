from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import Engine
from starlette.exceptions import HTTPException

from app.core.config import Settings, get_settings
from app.core.logging import configure_logging
from app.db.migrations import assert_database_at_head
from app.db.session import create_database_engine, create_session_factory
from app.errors import (
    http_exception_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)
from app.middleware import RequestContextMiddleware
from app.routers.auth import router as auth_router
from app.routers.health import router as health_router
from app.routers.process import router as process_router
from app.routers.records import router as records_router
from app.routers.users import router as users_router
from app.routers.work_session import router as work_session_router

MigrationChecker = Callable[[Engine, Path], None]


def create_app(
    settings: Settings | None = None,
    migration_checker: MigrationChecker = assert_database_at_head,
) -> FastAPI:
    app_settings = settings or get_settings()
    configure_logging(app_settings.log_level)
    engine = create_database_engine(app_settings.database_url)
    alembic_ini_path = Path(__file__).resolve().parents[1] / "alembic.ini"

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        migration_checker(engine, alembic_ini_path)
        yield
        engine.dispose()

    application = FastAPI(title="imleader API", version="0.1.0", lifespan=lifespan)
    application.add_exception_handler(HTTPException, http_exception_handler)
    application.add_exception_handler(RequestValidationError, validation_exception_handler)
    application.add_exception_handler(Exception, unhandled_exception_handler)
    application.state.session_factory = create_session_factory(engine)
    if app_settings.cors_origins:
        application.add_middleware(
            CORSMiddleware,
            allow_origins=app_settings.cors_origins,
            allow_credentials=True,
            allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=["Content-Type", "X-CSRF-Token", "X-Request-ID"],
        )
    application.add_middleware(RequestContextMiddleware)
    application.include_router(health_router, prefix="/api/v1")
    application.include_router(auth_router, prefix="/api/v1")
    application.include_router(process_router, prefix="/api/v1")
    application.include_router(records_router, prefix="/api/v1")
    application.include_router(users_router, prefix="/api/v1")
    application.include_router(work_session_router, prefix="/api/v1")
    return application


app = create_app()
