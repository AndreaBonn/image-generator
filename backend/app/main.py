from fastapi import APIRouter, FastAPI
from fastapi.exceptions import RequestValidationError

from app.api.v1.health import router as health_router
from app.config import Settings, settings
from app.errors import (
    AppError,
    handle_app_error,
    handle_unexpected_error,
    handle_validation_error,
)


def create_app(config: Settings | None = None) -> FastAPI:
    application = FastAPI(title="Studio Immagini")
    application.state.settings = config if config is not None else settings
    application.add_exception_handler(AppError, handle_app_error)
    application.add_exception_handler(RequestValidationError, handle_validation_error)
    application.add_exception_handler(Exception, handle_unexpected_error)
    router = APIRouter(prefix="/api/v1")
    router.include_router(health_router)
    application.include_router(router)
    return application


app = create_app()
