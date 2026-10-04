import json
from collections.abc import AsyncIterator
from typing import Annotated, Any, cast
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Request
from sse_starlette.sse import EventSourceResponse

from app.api.v1.job_limits import enforce_job_rate_limit
from app.engine.types import EngineClient
from app.models.job import JobRequest
from app.services.job_service import JobService

router = APIRouter(prefix="/jobs", dependencies=[Depends(enforce_job_rate_limit)])


def get_engine(request: Request) -> EngineClient:
    return cast(EngineClient, request.app.state.engine)


def get_job_service(request: Request) -> JobService:
    return cast(JobService, request.app.state.job_service)


ServiceDependency = Annotated[JobService, Depends(get_job_service)]
EngineDependency = Annotated[EngineClient, Depends(get_engine)]


@router.post(path="", status_code=202)
async def create_job(
    body: JobRequest,
    service: ServiceDependency,
    engine: EngineDependency,
    idempotency_key: Annotated[str | None, Header(min_length=1, max_length=200)] = None,
) -> dict[str, Any]:
    job_id = await service.submit(request=body, engine=engine, idempotency_key=idempotency_key)
    return {"data": {"job_id": job_id}}


@router.get(path="/{job_id}")
async def get_job(job_id: UUID, service: ServiceDependency) -> dict[str, Any]:
    return {"data": await service.status(job_id=str(job_id))}


@router.post(path="/{job_id}/cancel")
async def cancel_job(job_id: UUID, service: ServiceDependency) -> dict[str, Any]:
    return {"data": await service.cancel(job_id=str(job_id))}


async def stream_events(service: JobService, job_id: str) -> AsyncIterator[dict[str, str]]:
    async for event in service.events.stream(job_id=job_id):
        yield {"event": event.event, "data": json.dumps(event.data, ensure_ascii=False)}


@router.get(path="/{job_id}/events")
async def get_events(job_id: UUID, service: ServiceDependency) -> EventSourceResponse:
    await service.status(job_id=str(job_id))
    return EventSourceResponse(content=stream_events(service=service, job_id=str(job_id)))
