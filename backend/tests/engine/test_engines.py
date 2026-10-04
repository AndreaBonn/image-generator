import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from io import BytesIO
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, patch

import httpx
import pytest
import respx
from PIL import Image

from app.config import REPO_ROOT
from app.engine.comfy_client import ComfyClient
from app.engine.comfy_engine import ComfyEngine
from app.engine.fake_engine import FakeEngine, render_image
from app.engine.types import EngineRequest, Generated, ModelSwitch, Progress, Queued, Started
from app.errors import EngineUnavailableError

URL = "http://127.0.0.1:8188"
PROMPT_ID = "c5a3efdb-d76c-42dc-9f2f-7b136d816d73"


def request(family: str = "sdxl", seed: int = 42) -> EngineRequest:
    return EngineRequest(
        graph=json.loads((REPO_ROOT / "workflows/sdxl_lightning_txt2img.json").read_text()),
        family=family,
        seed=seed,
        width=128,
        height=64,
        batch=2,
    )


async def test_fake_engine_steps_family_switch_and_seed_image() -> None:
    fake = FakeEngine(step_delay_s=0, model_switch_eta_s=17)
    first = [event async for event in fake.run(request=request())]
    second = [event async for event in fake.run(request=request())]
    switched = [event async for event in fake.run(request=request(family="flux2_klein"))]
    assert isinstance(first[0], Queued)
    assert any(isinstance(event, Started) for event in first)
    assert [event.step for event in first if isinstance(event, Progress)] == [1, 2, 3, 4]
    assert [event for event in first if isinstance(event, ModelSwitch)] == [
        ModelSwitch(family="sdxl", eta_s=17)
    ]
    assert not any(isinstance(event, ModelSwitch) for event in second)
    assert ModelSwitch(family="flux2_klein", eta_s=17) in switched
    images = next(event.images for event in first if isinstance(event, Generated))
    assert len(images) == 2
    assert images == (render_image(width=128, height=64, seed=42),) * 2
    with Image.open(BytesIO(images[0])) as image:
        assert image.size == (128, 64)
        assert image.format == "PNG"
        colors = image.getcolors()
        assert colors is not None
        assert len(colors) > 1
    other = [event async for event in fake.run(request=request(seed=43))]
    assert images[0] != next(event.images[0] for event in other if isinstance(event, Generated))


@pytest.mark.parametrize("cached", [False, True])
@respx.mock
async def test_comfy_engine_streams_real_fixture_and_downloads_output(cached: bool) -> None:
    messages = json.loads((Path(__file__).parents[1] / "fixtures/ws/bozza_run.json").read_text())
    output = next(m["data"]["output"] for m in messages if m["type"] == "executed")
    if cached:
        messages = [m for m in messages if m["type"] != "executed"]
        respx.get(URL + "/history/" + PROMPT_ID).respond(
            json={PROMPT_ID: {"outputs": {"8": output}}}
        )
    respx.post(URL + "/prompt").respond(json={"prompt_id": PROMPT_ID})
    respx.get(URL + "/view").respond(content=b"result-png")
    socket = AsyncMock()
    socket.__aiter__.return_value = [b"preview", *[json.dumps(m) for m in messages]]

    @asynccontextmanager
    async def connection(*args: Any, **kwargs: Any) -> AsyncIterator[AsyncMock]:
        assert kwargs["proxy"] is None
        yield socket

    with patch("app.engine.comfy_engine.connect", side_effect=connection):
        async with httpx.AsyncClient(base_url=URL) as http:
            events = [
                event
                async for event in ComfyEngine(client=ComfyClient(http=http), url=URL).run(
                    request=request()
                )
            ]
    assert events[0] == Queued(prompt_id=PROMPT_ID)
    assert events[-1] == Generated(images=(b"result-png",))
    assert sum(isinstance(event, Progress) for event in events) == 4


async def test_comfy_engine_websocket_connection_error_is_domain_error() -> None:
    with patch("app.engine.comfy_engine.connect", side_effect=OSError("offline")):
        async with httpx.AsyncClient(base_url=URL) as http:
            with pytest.raises(EngineUnavailableError):
                async for _ in ComfyEngine(client=ComfyClient(http=http), url=URL).run(
                    request=request()
                ):
                    pass


@respx.mock
async def test_cancel_submission_targets_prompt_even_if_already_running() -> None:
    import asyncio

    accepted = asyncio.Event()
    respond = asyncio.Event()

    async def delayed_response(http_request: httpx.Request) -> httpx.Response:
        accepted.set()
        await respond.wait()
        return httpx.Response(status_code=200, json={"prompt_id": "accepted"})

    respx.post(URL + "/prompt").mock(side_effect=delayed_response)
    delete = respx.post(URL + "/queue").respond()
    interrupt = respx.post(URL + "/interrupt").respond()
    async with httpx.AsyncClient(base_url=URL) as http:
        engine = ComfyEngine(client=ComfyClient(http=http), url=URL)
        pending = asyncio.create_task(engine._submit(request=request(), client_id="c"))
        await accepted.wait()
        pending.cancel()
        respond.set()
        with pytest.raises(asyncio.CancelledError):
            await pending
    assert json.loads(delete.calls[0].request.content) == {"delete": ["accepted"]}
    assert json.loads(interrupt.calls[0].request.content) == {"prompt_id": "accepted"}


async def test_fake_interrupt_and_delete_stop_generation() -> None:
    fake = FakeEngine(step_delay_s=0)
    stream = fake.run(request=request())
    queued = await anext(stream)
    assert isinstance(queued, Queued)
    await fake.delete_from_queue(prompt_id=queued.prompt_id)
    from app.engine.types import Interrupted

    assert [event async for event in stream] == [Interrupted()]
    stream = fake.run(request=request())
    async for event in stream:
        if isinstance(event, Progress):
            await fake.interrupt()
            break
    assert [event async for event in stream] == [Interrupted()]
    await fake.free()
    assert fake.family is None


async def test_fake_engine_system_stats_reports_fake_identity() -> None:
    # Consumed by SystemService.status (app/services/system_service.py:61) behind /api/v1/system.
    assert await FakeEngine().system_stats() == {
        "system": {"comfyui_version": "fake"},
        "devices": [],
    }
