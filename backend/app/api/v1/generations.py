import asyncio
from typing import Annotated, Any, cast
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from fastapi.responses import FileResponse

from app.api.v1.job_limits import enforce_job_rate_limit
from app.api.v1.jobs import get_engine, get_job_service
from app.models.generation import FavoriteUpdate, GalleryQuery, RerunRequest
from app.services.generation_service import GenerationService

router = APIRouter(prefix="/generations")


def get_generation_service(request: Request) -> GenerationService:
    return cast(GenerationService, request.app.state.generation_service)


GenerationDependency = Annotated[GenerationService, Depends(get_generation_service)]


@router.get(path="")
def list_generations(
    service: GenerationDependency, query: Annotated[GalleryQuery, Query()]
) -> dict[str, Any]:
    return service.list(query=query)


@router.get(path="/trash/summary")
def get_trash_summary(service: GenerationDependency) -> dict[str, dict[str, int]]:
    return {"data": service.trash_summary()}


@router.post(path="/trash/empty")
def empty_trash(service: GenerationDependency) -> dict[str, dict[str, int]]:
    return {"data": service.empty_trash()}


@router.get(path="/{generation_id}")
def get_generation(generation_id: UUID, service: GenerationDependency) -> dict[str, Any]:
    return {"data": service.detail(generation_id=str(generation_id))}


@router.get(path="/{generation_id}/image")
def get_image(generation_id: UUID, service: GenerationDependency) -> FileResponse:
    return FileResponse(path=service.file(generation_id=str(generation_id)), media_type="image/png")


@router.get(path="/{generation_id}/thumbnail")
def get_thumbnail(generation_id: UUID, service: GenerationDependency) -> FileResponse:
    return FileResponse(
        path=service.file(generation_id=str(generation_id), thumbnail=True), media_type="image/webp"
    )


@router.patch(path="/{generation_id}")
def update_generation(
    generation_id: UUID, body: FavoriteUpdate, service: GenerationDependency
) -> dict[str, Any]:
    return {"data": service.favorite(generation_id=str(generation_id), favorite=body.favorite)}


@router.delete(path="/{generation_id}", status_code=204)
def delete_generation(generation_id: UUID, service: GenerationDependency) -> Response:
    service.delete(generation_id=str(generation_id))
    return Response(status_code=204)


@router.post(path="/{generation_id}/restore")
def restore_generation(generation_id: UUID, service: GenerationDependency) -> dict[str, Any]:
    return {"data": service.restore(generation_id=str(generation_id))}


@router.post(
    path="/{generation_id}/rerun", status_code=202, dependencies=[Depends(enforce_job_rate_limit)]
)
async def rerun_generation(
    generation_id: UUID,
    body: RerunRequest,
    request: Request,
    idempotency_key: Annotated[str | None, Header(min_length=1, max_length=200)] = None,
) -> dict[str, Any]:
    service = get_generation_service(request=request)
    original = await asyncio.to_thread(
        service.rerun_request, generation_id=str(generation_id), new_seed=body.new_seed
    )
    job_id = await get_job_service(request=request).submit(
        request=original,
        engine=get_engine(request=request),
        idempotency_key=idempotency_key,
    )
    return {"data": {"job_id": job_id}}
