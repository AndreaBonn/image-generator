from typing import cast

from fastapi import APIRouter, Request

from app.config import Settings
from app.services.maintenance_service import MaintenanceService

router = APIRouter(prefix="/maintenance")


@router.post(path="/clear-engine-output")
def clear_output(request: Request) -> dict[str, dict[str, int | float]]:
    config = cast(Settings, request.app.state.settings)
    return {"data": MaintenanceService(output_dir=config.comfy_output_dir).clear_output()}
