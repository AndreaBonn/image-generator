from typing import Annotated, Any, cast

from fastapi import APIRouter, Depends, Request

from app.engine.types import EngineClient
from app.services.asset_jobs import AssetJobs, AssetKind

router = APIRouter(prefix="/assets")


def get_asset_jobs(request: Request) -> AssetJobs:
    return cast(AssetJobs, request.app.state.asset_jobs)


def get_current_engine(request: Request) -> EngineClient:
    return cast(EngineClient, request.app.state.engine)


AssetJobsDependency = Annotated[AssetJobs, Depends(get_asset_jobs)]
EngineDependency = Annotated[EngineClient, Depends(get_current_engine)]


@router.post(path="/{kind}/generate", status_code=202)
async def start_asset_generation(
    kind: AssetKind, jobs: AssetJobsDependency, engine: EngineDependency
) -> dict[str, Any]:
    jobs.start(kind=kind, engine=engine)
    return {"data": jobs.snapshot()}


@router.get(path="/generation")
def get_asset_generation(jobs: AssetJobsDependency) -> dict[str, Any]:
    return {"data": jobs.snapshot()}


@router.post(path="/generation/cancel")
async def cancel_asset_generation(jobs: AssetJobsDependency) -> dict[str, Any]:
    await jobs.cancel()
    return {"data": jobs.snapshot()}
