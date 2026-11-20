from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from sqlalchemy import Engine

from app.core.config import Settings, get_settings
from app.core.logging import configure_logging
from app.db.migrations import assert_database_at_head
from app.db.session import create_database_engine
from app.middleware import RequestContextMiddleware
from app.routers.health import router as health_router

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
    application.add_middleware(RequestContextMiddleware)
    application.include_router(health_router, prefix="/api/v1")
    return application


app = create_app()
