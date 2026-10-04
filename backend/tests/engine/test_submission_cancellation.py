import asyncio
from typing import Any
from unittest.mock import AsyncMock

import pytest

from app.engine.comfy_engine import ComfyEngine
from app.engine.types import EngineRequest
from app.errors import EngineUnavailableError


@pytest.mark.parametrize("cleanup_fails", [False, True])
async def test_submission_failure_does_not_replace_cancellation(cleanup_fails: bool) -> None:
    entered, release = asyncio.Event(), asyncio.Event()

    async def submit(**kwargs: Any) -> str:
        entered.set()
        await release.wait()
        if not cleanup_fails:
            raise EngineUnavailableError()
        return "p"

    client = AsyncMock()
    client.queue_prompt.side_effect = submit
    client.cancel_prompt.side_effect = EngineUnavailableError()
    engine = ComfyEngine(client=client, url="http://127.0.0.1:8188")
    request = EngineRequest(graph={}, family="sdxl", width=32, height=32, seed=1, batch=1)
    task = asyncio.create_task(engine._submit(request=request, client_id="c"))
    await entered.wait()
    task.cancel()
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await task


async def test_repeated_cancellation_drains_post_and_cleans_up() -> None:
    entered, release = asyncio.Event(), asyncio.Event()

    async def submit(**kwargs: Any) -> str:
        entered.set()
        await release.wait()
        return "accepted"

    client = AsyncMock()
    client.queue_prompt.side_effect = submit
    engine = ComfyEngine(client=client, url="http://127.0.0.1:8188")
    request = EngineRequest(graph={}, family="sdxl", width=32, height=32, seed=1, batch=1)
    task = asyncio.create_task(engine._submit(request=request, client_id="c"))
    await entered.wait()
    task.cancel()
    await asyncio.sleep(delay=0)
    task.cancel()
    await asyncio.sleep(delay=0)
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    client.cancel_prompt.assert_awaited_once_with(prompt_id="accepted")
