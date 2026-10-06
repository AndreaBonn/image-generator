from fastapi import APIRouter, FastAPI
from fastapi.exceptions import RequestValidationError

from app.api.origin_guard import OriginGuardMiddleware
from app.api.spa import register_spa
from app.api.v1.examples import router as examples_router
from app.api.v1.generations import router as generations_router
from app.api.v1.health import router as health_router
from app.api.v1.jobs import router as jobs_router
from app.api.v1.maintenance import router as maintenance_router
from app.api.v1.models import router as models_router
from app.api.v1.prompt import router as prompt_router
from app.api.v1.styles import router as styles_router
from app.api.v1.system import router as system_router
from app.api.v1.tasks import router as tasks_router
from app.api.v1.uploads import router as uploads_router
from app.config import Settings, settings
from app.errors import (
    AppError,
    handle_app_error,
    handle_unexpected_error,
    handle_validation_error,
)
from app.lifespan import lifespan


def create_app(config: Settings | None = None) -> FastAPI:
    application = FastAPI(title="Image Generator", lifespan=lifespan)
    application.state.settings = config if config is not None else settings
    application.add_middleware(OriginGuardMiddleware)
    application.add_exception_handler(AppError, handle_app_error)
    application.add_exception_handler(RequestValidationError, handle_validation_error)
    application.add_exception_handler(Exception, handle_unexpected_error)
    router = APIRouter(prefix="/api/v1")
    router.include_router(health_router)
    router.include_router(jobs_router)
    router.include_router(tasks_router)
    router.include_router(styles_router)
    router.include_router(prompt_router)
    router.include_router(uploads_router)
    router.include_router(generations_router)
    router.include_router(examples_router)
    router.include_router(system_router)
    router.include_router(maintenance_router)
    router.include_router(models_router)
    application.include_router(router)
    register_spa(application=application)
    return application


app = create_app()
