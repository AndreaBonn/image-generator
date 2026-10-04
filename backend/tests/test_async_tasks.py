import asyncio

import pytest

from app.async_tasks import drain_task


async def test_drain_task_returns_result_without_waiting_when_already_done() -> None:
    async def finished() -> str:
        return "value"

    task = asyncio.create_task(finished())
    await task
    assert await drain_task(task=task) == "value"


async def test_drain_task_survives_single_caller_cancellation_and_returns_result() -> None:
    release = asyncio.Event()

    async def worker() -> str:
        await release.wait()
        return "finished"

    inner = asyncio.create_task(worker())

    async def caller() -> str:
        return await drain_task(task=inner)

    outer = asyncio.create_task(caller())
    await asyncio.sleep(delay=0)
    outer.cancel()
    await asyncio.sleep(delay=0)
    assert not inner.cancelled()
    release.set()
    assert await outer == "finished"


async def test_drain_task_reraises_cancelled_error_when_the_task_itself_is_cancelled() -> None:
    started = asyncio.Event()

    async def worker() -> str:
        started.set()
        await asyncio.sleep(delay=10)
        return "unused"

    task = asyncio.create_task(worker())
    await started.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await drain_task(task=task)
