from typing import Any, cast

from fastapi import APIRouter, Request

from app.api.v1.jobs import EngineDependency, get_job_service
from app.config import Settings
from app.services.system_service import SystemService
from app.services.task_catalog import TaskCatalog

router = APIRouter(prefix="/system")


@router.get(path="")
async def get_system(request: Request, engine: EngineDependency) -> dict[str, Any]:
    service = SystemService(
        config=cast(Settings, request.app.state.settings),
        catalog=cast(TaskCatalog, request.app.state.task_catalog),
    )
    family = get_job_service(request=request).runner.family
    return {"data": await service.status(engine=engine, loaded_family=family)}
