import json
from collections.abc import AsyncIterator
from typing import Annotated, Any, cast

from fastapi import APIRouter, Depends, Request
from sse_starlette.sse import EventSourceResponse

from app.services.model_downloads import ModelDownloads

router = APIRouter(prefix="/models")


def get_model_downloads(request: Request) -> ModelDownloads:
    return cast(ModelDownloads, request.app.state.model_downloads)


DownloadsDependency = Annotated[ModelDownloads, Depends(get_model_downloads)]


@router.post(path="/{model_id}/install", status_code=202)
async def install_model(model_id: str, downloads: DownloadsDependency) -> dict[str, Any]:
    downloads.start(model_id=model_id)
    return {"data": {"status": "started"}}


@router.post(path="/{model_id}/install/cancel")
async def cancel_install(model_id: str, downloads: DownloadsDependency) -> dict[str, Any]:
    await downloads.cancel(model_id=model_id)
    return {"data": {"status": "cancelled"}}


async def stream_download_events(downloads: ModelDownloads) -> AsyncIterator[dict[str, str]]:
    async for event in downloads.events.stream():
        payload = event.data.model_dump(mode="json")
        yield {"event": event.event, "data": json.dumps(payload, ensure_ascii=False)}


@router.get(path="/downloads/events")
async def get_download_events(downloads: DownloadsDependency) -> EventSourceResponse:
    return EventSourceResponse(content=stream_download_events(downloads=downloads))
