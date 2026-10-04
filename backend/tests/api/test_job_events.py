import asyncio
from collections.abc import AsyncGenerator
from typing import Any
from unittest.mock import AsyncMock

import pytest
from test_jobs import JobApp, wait_terminal
from test_jobs import job_app as job_app

from app.api.v1.jobs import get_engine
from app.engine.fake_engine import FakeEngine
from app.engine.types import EngineEvent, EngineRequest, Queued
from app.main import create_app
from app.services.job_events import JobEvent


class QueueGate(FakeEngine):
    def __init__(self) -> None:
        super().__init__(step_delay_s=0)
        self.queued = asyncio.Event()
        self.release = asyncio.Event()

    async def run(self, request: EngineRequest) -> AsyncGenerator[EngineEvent, None]:
        yield Queued(prompt_id="queued")
        self.queued.set()
        await self.release.wait()
        async for event in super().run(request=request):
            yield event


async def test_live_stream_reports_sampler_progress_and_closes(job_app: JobApp) -> None:
    application, client = job_app
    engine = QueueGate()
    application.dependency_overrides[get_engine] = lambda: engine
    response = await client.post("/api/v1/jobs", json={"task_id": "bozza", "prompt": "cat"})
    await engine.queued.wait()
    job_id = response.json()["data"]["job_id"]
    stream = application.state.job_service.events.stream(job_id=job_id)
    first = await anext(stream)
    assert first.event == "model_switch"
    engine.release.set()
    events = [event async for event in stream]
    assert [
        (event.data["step"], event.data["total"]) for event in events if event.event == "progress"
    ] == [(1, 4), (2, 4), (3, 4), (4, 4)]
    assert events[-1].event == "completed"
    assert application.state.job_service.events.subscribers == {}


async def test_switch_family_emits_configured_eta_and_conditionally_frees(
    job_app: JobApp, monkeypatch: pytest.MonkeyPatch
) -> None:
    application, client = job_app
    service = application.state.job_service
    events: list[JobEvent] = []
    monkeypatch.setattr(service.events, "publish", lambda job_id, event: events.append(event))
    engine = FakeEngine(step_delay_s=0)
    free = AsyncMock(wraps=engine.free)
    monkeypatch.setattr(engine, "free", free)
    application.dependency_overrides[get_engine] = lambda: engine
    for task in service.resources.catalog.tasks:
        if task.id == "testo":
            task.free_on_family_switch = True
    for task_id in ("bozza", "qualita", "testo"):
        response = await client.post(
            "/api/v1/jobs", json={"task_id": task_id, "prompt": "cat", "params": {"style_ids": []}}
        )
        assert (await wait_terminal(client=client, job_id=response.json()["data"]["job_id"]))[
            "status"
        ] == "completed"
    assert [
        (event.data["family"], event.data["eta_s"])
        for event in events
        if event.event == "model_switch"
    ] == [("sdxl", 13), ("flux2_klein", 13)]
    free.assert_awaited_once()


async def test_app_restart_reconciles_pending_jobs_and_replays_failure(job_app: JobApp) -> None:
    application, client = job_app
    repository = application.state.job_service.repository
    queued, _ = repository.create(request={"task_id": "bozza"}, idempotency_key=None)
    running, _ = repository.create(request={"task_id": "testo"}, idempotency_key=None)
    repository.set_running(job_id=running.id)
    restarted = create_app(config=application.state.settings)
    async with restarted.router.lifespan_context(restarted):
        for job_id in (queued.id, running.id):
            service = restarted.state.job_service
            state = await service.status(job_id=job_id)
            assert state["status"] == "failed" and state["error_code"] == "ENGINE_RESTARTED"
            event = await anext(service.events.stream(job_id=job_id))
            assert event.event == "failed" and event.data["code"] == "ENGINE_RESTARTED"


@pytest.mark.parametrize(
    "body,field",
    [
        ({"task_id": "bozza", "prompt": "   "}, "prompt"),
        ({"task_id": "bozza", "prompt": "cat", "params": {"batch": 0}}, "params.batch"),
        ({"task_id": "bozza", "prompt": "cat", "params": {"seed": -1}}, "params.seed"),
        ({"task_id": "bozza", "prompt": "cat", "params": {"seed": 2**32}}, "params.seed"),
        ({"task_id": "bozza", "prompt": "cat", "params": {"steps": 100}}, "params.steps"),
    ],
)
async def test_job_validation_returns_field_errors(
    job_app: JobApp, body: dict[str, Any], field: str
) -> None:
    _, client = job_app
    response = await client.post("/api/v1/jobs", json=body)
    assert response.status_code == 422
    assert response.json()["error"]["details"][0]["field"] == field


async def test_missing_job_returns_404_before_sse_headers(job_app: JobApp) -> None:
    _, client = job_app
    for suffix in ("", "/events"):
        response = await client.get("/api/v1/jobs/00000000-0000-0000-0000-000000000000" + suffix)
        assert response.status_code == 404 and response.json()["error"]["code"] == "NOT_FOUND"


@pytest.mark.parametrize("unknown_task", [True, False])
async def test_unknown_task_or_missing_workflow_is_unavailable(
    job_app: JobApp, unknown_task: bool, monkeypatch: pytest.MonkeyPatch
) -> None:
    application, client = job_app
    if not unknown_task:
        repository = application.state.task_catalog.repository
        monkeypatch.setattr(repository, "has_workflow", lambda filename: False)
    response = await client.post(
        "/api/v1/jobs", json={"task_id": "unknown" if unknown_task else "bozza", "prompt": "cat"}
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "MODEL_NOT_INSTALLED"
