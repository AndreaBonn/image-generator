import asyncio
from collections.abc import AsyncGenerator
from dataclasses import replace

from test_jobs import JobApp, wait_terminal
from test_jobs import job_app as job_app

from app.api.v1.jobs import get_engine
from app.engine.fake_engine import FakeEngine
from app.engine.types import EngineEvent, EngineRequest, Queued, Started


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
    engine = PausedEngine()
    application.dependency_overrides[get_engine] = lambda: engine
    first = await client.post("/api/v1/jobs", json={"task_id": "bozza", "prompt": "first"})
    await engine.entered.wait()
    second = await client.post("/api/v1/jobs", json={"task_id": "bozza", "prompt": "second"})
    job_id = first.json()["data"]["job_id"]
    cancellation = asyncio.create_task(client.post(f"/api/v1/jobs/{job_id}/cancel"))
    await engine.stop_entered.wait()
    await asyncio.sleep(delay=0.05)
    try:
        assert engine.calls == 1
    finally:
        engine.allow_stop.set()
        engine.release.set()
        await cancellation
    assert (await client.get(f"/api/v1/jobs/{job_id}")).json()["data"]["status"] == "cancelled"
    assert (await wait_terminal(client=client, job_id=second.json()["data"]["job_id"]))[
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
