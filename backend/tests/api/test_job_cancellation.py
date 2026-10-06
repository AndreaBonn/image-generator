import asyncio
import logging
from collections.abc import AsyncGenerator
from dataclasses import replace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from test_jobs import JobApp, wait_terminal
from test_jobs import job_app as job_app

from app.api.v1.jobs import get_engine
from app.engine.fake_engine import FakeEngine
from app.engine.types import EngineEvent, EngineRequest, Interrupted, Queued, Started
from app.errors import EngineUnavailableError
from app.services.job_service import JobService


async def test_cancel_job_unknown_id_returns_not_found(job_app: JobApp) -> None:
    _, client = job_app
    job_id = uuid4()

    response = await client.post(url=f"/api/v1/jobs/{job_id}/cancel")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


class PausedEngine(FakeEngine):
    def __init__(self, started: bool = True) -> None:
        super().__init__(step_delay_s=0)
        self.entered = asyncio.Event()
        self.release = asyncio.Event()
        self.stop_entered = asyncio.Event()
        self.allow_stop = asyncio.Event()
        self.started = started
        self.calls = 0
        self.interrupts = 0

    async def run(self, request: EngineRequest) -> AsyncGenerator[EngineEvent, None]:
        self.calls += 1
        yield Queued(prompt_id="p")
        if self.started:
            yield Started()
        self.entered.set()
        await self.release.wait()
        async for event in super().run(request=request):
            yield event

    async def interrupt(self) -> None:
        self.interrupts += 1
        self.stop_entered.set()
        await self.allow_stop.wait()


async def test_cancel_internal_queue_never_interrupts_active_job(job_app: JobApp) -> None:
    application, client = job_app
    engine = PausedEngine()
    application.dependency_overrides[get_engine] = lambda: engine
    first = await client.post("/api/v1/jobs", json={"task_id": "bozza", "prompt": "first"})
    await engine.entered.wait()
    second = await client.post("/api/v1/jobs", json={"task_id": "bozza", "prompt": "second"})
    second_id = second.json()["data"]["job_id"]
    snapshot = await application.state.job_service.events.snapshot(job_id=second_id)
    response = await client.post(f"/api/v1/jobs/{second_id}/cancel")
    assert response.json()["data"]["status"] == "cancelled"
    assert engine.calls == 1 and engine.interrupts == 0
    replay = await client.get(f"/api/v1/jobs/{second_id}/events")
    assert "event: cancelled" in replay.text
    engine.release.set()
    result = await wait_terminal(client=client, job_id=first.json()["data"]["job_id"])
    assert result["status"] == "completed"
    assert snapshot.event == "queued" and snapshot.data["position"] == 1


async def test_cancel_running_holds_serialization_until_interrupt_finishes(job_app: JobApp) -> None:
    application, client = job_app
    service: JobService = application.state.job_service
    engine = PausedEngine()
    application.dependency_overrides[get_engine] = lambda: engine
    first = await client.post(url="/api/v1/jobs", json={"task_id": "bozza", "prompt": "first"})
    await engine.entered.wait()
    second = await client.post(url="/api/v1/jobs", json={"task_id": "bozza", "prompt": "second"})
    job_id = first.json()["data"]["job_id"]
    first_task = service.runs[job_id].task
    second_task = service.runs[second.json()["data"]["job_id"]].task
    assert first_task is not None and second_task is not None
    cancellation = asyncio.create_task(coro=client.post(url=f"/api/v1/jobs/{job_id}/cancel"))
    await engine.stop_entered.wait()
    try:
        assert engine.calls == 1
    finally:
        engine.allow_stop.set()
        engine.release.set()
        await cancellation
    await asyncio.gather(first_task, second_task)
    assert engine.calls == 2
    assert (await client.get(url=f"/api/v1/jobs/{job_id}")).json()["data"]["status"] == "cancelled"
    assert (await client.get(url=f"/api/v1/jobs/{second.json()['data']['job_id']}")).json()["data"][
        "status"
    ] == "completed"


async def test_cancel_engine_queue_deletes_prompt(job_app: JobApp) -> None:
    application, client = job_app
    engine = PausedEngine(started=False)
    application.dependency_overrides[get_engine] = lambda: engine
    response = await client.post("/api/v1/jobs", json={"task_id": "bozza", "prompt": "cat"})
    await engine.entered.wait()
    result = await client.post(f"/api/v1/jobs/{response.json()['data']['job_id']}/cancel")
    assert result.json()["data"]["status"] == "cancelled"
    assert engine.deleted == {"p"} and engine.interrupts == 0


async def test_timeout_interrupts_and_persists_failure(job_app: JobApp) -> None:
    application, client = job_app
    engine = PausedEngine()
    engine.allow_stop.set()
    service = application.state.job_service
    service.resources = replace(
        service.resources,
        settings=service.resources.settings.model_copy(update={"job_timeout_s": 1}),
    )
    service.runner.resources = service.resources
    application.dependency_overrides[get_engine] = lambda: engine
    response = await client.post("/api/v1/jobs", json={"task_id": "bozza", "prompt": "cat"})
    result = await wait_terminal(client=client, job_id=response.json()["data"]["job_id"])
    assert result["status"] == "failed" and result["error_code"] == "JOB_TIMEOUT"
    assert engine.interrupts == 1


class InterruptingEngine(FakeEngine):
    async def run(self, request: EngineRequest) -> AsyncGenerator[EngineEvent, None]:
        yield Queued(prompt_id="p")
        yield Started()
        yield Interrupted()


async def test_engine_reported_interruption_finishes_cancelled_without_calling_stop(
    job_app: JobApp, monkeypatch: pytest.MonkeyPatch
) -> None:
    application, client = job_app
    engine = InterruptingEngine(step_delay_s=0)
    interrupt = AsyncMock(wraps=engine.interrupt)
    delete_from_queue = AsyncMock(wraps=engine.delete_from_queue)
    monkeypatch.setattr(engine, "interrupt", interrupt)
    monkeypatch.setattr(engine, "delete_from_queue", delete_from_queue)
    application.dependency_overrides[get_engine] = lambda: engine
    response = await client.post("/api/v1/jobs", json={"task_id": "bozza", "prompt": "cat"})
    job_id = response.json()["data"]["job_id"]
    result = await wait_terminal(client=client, job_id=job_id)
    assert result["status"] == "cancelled"
    # The engine already reported the interruption itself: job_runner must not
    # ask it to stop again.
    interrupt.assert_not_awaited()
    delete_from_queue.assert_not_awaited()


class FailingInterruptEngine(FakeEngine):
    def __init__(self) -> None:
        super().__init__(step_delay_s=0)
        self.entered = asyncio.Event()

    async def run(self, request: EngineRequest) -> AsyncGenerator[EngineEvent, None]:
        yield Queued(prompt_id="p")
        yield Started()
        self.entered.set()
        # Stay running until cancelled: with step_delay_s=0 the fake finished on its own under
        # CPU load before the cancel request arrived, so interrupt() was never called.
        await asyncio.Event().wait()
        yield Queued(prompt_id="unreachable")

    async def interrupt(self) -> None:
        raise EngineUnavailableError()


async def test_cancel_logs_and_still_finishes_when_engine_interrupt_raises(
    job_app: JobApp, caplog: pytest.LogCaptureFixture
) -> None:
    application, client = job_app
    engine = FailingInterruptEngine()
    application.dependency_overrides[get_engine] = lambda: engine
    response = await client.post("/api/v1/jobs", json={"task_id": "bozza", "prompt": "cat"})
    await engine.entered.wait()
    job_id = response.json()["data"]["job_id"]
    with caplog.at_level(logging.ERROR):
        result = await client.post(f"/api/v1/jobs/{job_id}/cancel")
    assert result.json()["data"]["status"] == "cancelled"
    assert "Engine cancellation failed" in caplog.text


async def test_cancel_after_completion_is_a_no_op(job_app: JobApp) -> None:
    application, client = job_app
    response = await client.post("/api/v1/jobs", json={"task_id": "bozza", "prompt": "cat"})
    job_id = response.json()["data"]["job_id"]
    completed = await wait_terminal(client=client, job_id=job_id)
    assert completed["status"] == "completed"
    result = await client.post(f"/api/v1/jobs/{job_id}/cancel")
    assert result.json()["data"]["status"] == "completed"


async def test_cancel_request_disconnect_still_lets_the_job_settle_to_cancelled(
    job_app: JobApp,
) -> None:
    application, client = job_app
    service = application.state.job_service
    engine = PausedEngine()
    application.dependency_overrides[get_engine] = lambda: engine
    first = await client.post("/api/v1/jobs", json={"task_id": "bozza", "prompt": "first"})
    await engine.entered.wait()
    job_id = first.json()["data"]["job_id"]
    cancellation = asyncio.create_task(coro=service.cancel(job_id=job_id))
    await engine.stop_entered.wait()
    # The underlying job task is shielded inside _stop(); cancelling the caller
    # here must only abort *our* wait on it, not the job's own cancellation.
    cancellation.cancel()
    with pytest.raises(asyncio.CancelledError):
        await cancellation
    engine.allow_stop.set()
    engine.release.set()
    assert (await wait_terminal(client=client, job_id=job_id))["status"] == "cancelled"
