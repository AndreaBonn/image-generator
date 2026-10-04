import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any
from unittest.mock import patch

import httpx
import pytest
import respx

from app.config import REPO_ROOT
from app.engine.comfy_client import ComfyClient
from app.engine.comfy_engine import ComfyEngine
from app.engine.types import EngineRequest, Failed, Generated, Interrupted, Queued, Started
from app.errors import EngineExecutionError, EngineUnavailableError

URL = "http://127.0.0.1:8188"
PROMPT_ID = "c5a3efdb-d76c-42dc-9f2f-7b136d816d73"
OUTPUT_NODE_ID = "8"  # sdxl_lightning_txt2img.json node titled "@output" (SaveImage).


def request() -> EngineRequest:
    return EngineRequest(
        graph=json.loads((REPO_ROOT / "workflows/sdxl_lightning_txt2img.json").read_text()),
        family="sdxl",
        seed=42,
        width=128,
        height=64,
        batch=1,
    )


def message(type_: str, **data: Any) -> str:
    return json.dumps({"type": type_, "data": {"prompt_id": PROMPT_ID, **data}})


class FakeSocket:
    """Minimal stand-in for websockets' ClientConnection: just an async-iterable of frames."""

    def __init__(self, frames: list[bytes | str]) -> None:
        self._frames = frames

    async def __aiter__(self) -> AsyncIterator[bytes | str]:
        for frame in self._frames:
            yield frame


def connect_to(socket: FakeSocket) -> Any:
    @asynccontextmanager
    async def connection(*args: Any, **kwargs: Any) -> AsyncIterator[FakeSocket]:
        yield socket

    return connection


async def run_engine(socket: FakeSocket) -> list[Any]:
    with patch("app.engine.comfy_engine.connect", side_effect=connect_to(socket=socket)):
        async with httpx.AsyncClient(base_url=URL) as http:
            return [
                event
                async for event in ComfyEngine(client=ComfyClient(http=http), url=URL).run(
                    request=request()
                )
            ]


@respx.mock
async def test_comfy_engine_succeeded_without_images_anywhere_raises_execution_error() -> None:
    respx.post(URL + "/prompt").respond(json={"prompt_id": PROMPT_ID})
    respx.get(URL + "/history/" + PROMPT_ID).respond(json={PROMPT_ID: {"outputs": {}}})
    socket = FakeSocket(frames=[message("execution_start"), message("execution_success")])
    with pytest.raises(EngineExecutionError):
        await run_engine(socket=socket)


@respx.mock
async def test_comfy_engine_failed_event_ends_the_stream() -> None:
    respx.post(URL + "/prompt").respond(json={"prompt_id": PROMPT_ID})
    socket = FakeSocket(
        frames=[
            message("execution_start"),
            message("execution_error", exception_type="ValueError", exception_message="boom"),
            # Must never be reached: the stream ends at the Failed event above.
            message("execution_start"),
        ]
    )
    events = await run_engine(socket=socket)
    assert len(events) == 3
    assert events[0] == Queued(prompt_id=PROMPT_ID)
    assert isinstance(events[1], Started)
    assert isinstance(events[2], Failed)


@respx.mock
async def test_comfy_engine_interrupted_event_ends_the_stream() -> None:
    respx.post(URL + "/prompt").respond(json={"prompt_id": PROMPT_ID})
    socket = FakeSocket(
        frames=[
            message("execution_start"),
            message("execution_interrupted"),
            # Must never be reached: the stream ends at the Interrupted event above.
            message("execution_start"),
        ]
    )
    events = await run_engine(socket=socket)
    assert events == [Queued(prompt_id=PROMPT_ID), Started(), Interrupted()]


@respx.mock
async def test_comfy_engine_socket_closes_without_terminal_event_raises_unavailable() -> None:
    respx.post(URL + "/prompt").respond(json={"prompt_id": PROMPT_ID})
    socket = FakeSocket(frames=[message("execution_start")])
    with pytest.raises(EngineUnavailableError):
        await run_engine(socket=socket)


@respx.mock
async def test_comfy_engine_skips_binary_preview_frames_between_json_events() -> None:
    respx.post(URL + "/prompt").respond(json={"prompt_id": PROMPT_ID})
    respx.get(URL + "/view").respond(content=b"png-bytes")
    image = {"filename": "a.png", "subfolder": "", "type": "output"}
    socket = FakeSocket(
        frames=[
            b"binary-preview-1",
            message("execution_start"),
            b"binary-preview-2",
            message("executed", node=OUTPUT_NODE_ID, output={"images": [image]}),
            b"binary-preview-3",
            message("execution_success"),
        ]
    )
    events = await run_engine(socket=socket)
    assert events[0] == Queued(prompt_id=PROMPT_ID)
    assert Started() in events
    assert events[-1] == Generated(images=(b"png-bytes",))


@respx.mock
async def test_comfy_engine_interrupt_without_prompt_id_makes_no_http_call() -> None:
    delete = respx.post(URL + "/queue")
    interrupt = respx.post(URL + "/interrupt")
    async with httpx.AsyncClient(base_url=URL) as http:
        await ComfyEngine(client=ComfyClient(http=http), url=URL).interrupt()
    assert not delete.called
    assert not interrupt.called


@respx.mock
async def test_comfy_engine_interrupt_with_prompt_id_cancels_that_prompt() -> None:
    delete = respx.post(URL + "/queue").respond()
    interrupt = respx.post(URL + "/interrupt").respond()
    async with httpx.AsyncClient(base_url=URL) as http:
        engine = ComfyEngine(client=ComfyClient(http=http), url=URL)
        engine.prompt_id = PROMPT_ID
        await engine.interrupt()
    assert json.loads(delete.calls[0].request.content) == {"delete": [PROMPT_ID]}
    assert json.loads(interrupt.calls[0].request.content) == {"prompt_id": PROMPT_ID}


@respx.mock
async def test_comfy_engine_delete_from_queue_cancels_given_prompt() -> None:
    delete = respx.post(URL + "/queue").respond()
    interrupt = respx.post(URL + "/interrupt").respond()
    async with httpx.AsyncClient(base_url=URL) as http:
        await ComfyEngine(client=ComfyClient(http=http), url=URL).delete_from_queue(
            prompt_id=PROMPT_ID
        )
    assert json.loads(delete.calls[0].request.content) == {"delete": [PROMPT_ID]}
    assert json.loads(interrupt.calls[0].request.content) == {"prompt_id": PROMPT_ID}


@respx.mock
async def test_comfy_engine_free_releases_engine_memory() -> None:
    free = respx.post(URL + "/free").respond()
    async with httpx.AsyncClient(base_url=URL) as http:
        await ComfyEngine(client=ComfyClient(http=http), url=URL).free()
    assert json.loads(free.calls[0].request.content) == {
        "unload_models": True,
        "free_memory": True,
    }


@respx.mock
async def test_comfy_engine_upload_image_returns_assigned_name() -> None:
    respx.post(URL + "/upload/image").respond(json={"name": "assigned.png"})
    async with httpx.AsyncClient(base_url=URL) as http:
        name = await ComfyEngine(client=ComfyClient(http=http), url=URL).upload_image(
            image=b"png-bytes", name="input.png"
        )
    assert name == "assigned.png"


@respx.mock
async def test_comfy_engine_system_stats_returns_engine_payload() -> None:
    respx.get(URL + "/system_stats").respond(json={"devices": ["gpu0"]})
    async with httpx.AsyncClient(base_url=URL) as http:
        stats = await ComfyEngine(client=ComfyClient(http=http), url=URL).system_stats()
    assert stats == {"devices": ["gpu0"]}
