import asyncio
import json
import logging
from collections.abc import AsyncGenerator, AsyncIterator
from typing import Any
from uuid import uuid4

from websockets.asyncio.client import ClientConnection, connect
from websockets.exceptions import WebSocketException

from app.async_tasks import drain_task
from app.engine.comfy_client import ComfyClient
from app.engine.events import EventParser
from app.engine.previews import parse_preview
from app.engine.types import (
    EngineEvent,
    EngineRequest,
    Failed,
    Generated,
    ImageReference,
    Interrupted,
    OutputImages,
    Queued,
    Succeeded,
)
from app.errors import AppError, EngineExecutionError, EngineUnavailableError

logger = logging.getLogger(__name__)


class ComfyEngine:
    def __init__(self, client: ComfyClient, url: str) -> None:
        self.client = client
        self.url = url.replace("http://", "ws://", 1)
        self.prompt_id: str | None = None

    async def run(self, request: EngineRequest) -> AsyncGenerator[EngineEvent, None]:
        client_id = str(uuid4())
        try:
            async with connect(uri=f"{self.url}/ws?clientId={client_id}", proxy=None) as socket:
                prompt_id = await self._submit(request=request, client_id=client_id)
                self.prompt_id = prompt_id
                yield Queued(prompt_id=prompt_id)
                parser = EventParser(graph=request.graph, prompt_id=prompt_id)
                async for event in self._receive(socket=socket, parser=parser):
                    yield event
        except (OSError, TimeoutError, WebSocketException) as error:
            raise EngineUnavailableError() from error

    async def _submit(self, request: EngineRequest, client_id: str) -> str:
        submission = asyncio.create_task(
            self.client.queue_prompt(graph=request.graph, client_id=client_id)
        )
        try:
            return await asyncio.shield(arg=submission)
        except asyncio.CancelledError as cancellation:
            # Recover the accepted ID before abandoning a POST that may already have queued work.
            try:
                cleanup = asyncio.create_task(coro=self._cancel_submission(submission=submission))
                await drain_task(task=cleanup)
            except AppError:
                logger.exception("Engine submission cleanup failed: client_id=%s", client_id)
            raise cancellation

    async def _cancel_submission(self, submission: asyncio.Task[str]) -> None:
        prompt_id = await submission
        await self.client.cancel_prompt(prompt_id=prompt_id)

    async def _receive(
        self, socket: ClientConnection, parser: EventParser
    ) -> AsyncIterator[EngineEvent]:
        images: tuple[ImageReference, ...] = ()
        async for frame in socket:
            if isinstance(frame, bytes):
                preview = parse_preview(frame=frame)
                if preview is not None:
                    yield preview
                continue
            event = parser.parse(message=json.loads(s=frame))
            if isinstance(event, OutputImages):
                images = event.images
            elif isinstance(event, Succeeded):
                images = images or await self._history_images(parser=parser)
                if not images:
                    raise EngineExecutionError()
                yield await self._download(images=images)
                return
            elif event is not None:
                yield event
                if isinstance(event, (Failed, Interrupted)):
                    return
        raise EngineUnavailableError()

    async def _download(self, images: tuple[ImageReference, ...]) -> Generated:
        contents = [
            await self.client.view(
                filename=image.filename, subfolder=image.subfolder, type=image.type
            )
            for image in images
        ]
        return Generated(images=tuple(contents))

    async def _history_images(self, parser: EventParser) -> tuple[ImageReference, ...]:
        history = await self.client.history(prompt_id=parser.prompt_id)
        output = history.get(parser.prompt_id, {}).get("outputs", {}).get(parser.output_id, {})
        return tuple(ImageReference.model_validate(obj=image) for image in output.get("images", []))

    async def interrupt(self) -> None:
        if self.prompt_id is not None:
            await self.client.cancel_prompt(prompt_id=self.prompt_id)

    async def delete_from_queue(self, prompt_id: str) -> None:
        await self.client.cancel_prompt(prompt_id=prompt_id)

    async def free(self) -> None:
        await self.client.free()

    async def upload_image(self, image: bytes, name: str) -> str:
        return await self.client.upload_image(image=image, name=name)

    async def system_stats(self) -> dict[str, Any]:
        return await self.client.system_stats()
