"""GET /api/v1/jobs/active: the jobs this process is running now (N1)."""

import asyncio
from collections.abc import AsyncGenerator

from test_jobs import JobApp, wait_terminal
from test_jobs import job_app as job_app

from app.api.v1.jobs import get_engine
from app.engine.fake_engine import FakeEngine
from app.engine.types import EngineEvent, EngineRequest, Queued, Started


class HeldEngine(FakeEngine):
    """Fake engine that stays in 'running' until the test releases it."""

    def __init__(self) -> None:
        super().__init__()
        self.entered = asyncio.Event()
        self.release = asyncio.Event()

    async def run(self, request: EngineRequest) -> AsyncGenerator[EngineEvent, None]:
        yield Queued(prompt_id="held")
        yield Started()
        self.entered.set()
        await self.release.wait()
        async for event in super().run(request=request):
            if not isinstance(event, (Queued, Started)):
                yield event


async def test_active_jobs_is_empty_when_nothing_runs(job_app: JobApp) -> None:
    _, client = job_app

    response = await client.get(url="/api/v1/jobs/active")

    assert response.status_code == 200
    assert response.json() == {"data": []}


async def test_active_jobs_lists_a_running_job_until_it_ends(job_app: JobApp) -> None:
    application, client = job_app
    engine = HeldEngine()
    application.dependency_overrides[get_engine] = lambda: engine
    created = await client.post(url="/api/v1/jobs", json={"task_id": "bozza", "prompt": "cat"})
    job_id = created.json()["data"]["job_id"]
    await asyncio.wait_for(fut=engine.entered.wait(), timeout=5)

    running = await client.get(url="/api/v1/jobs/active")

    assert running.json()["data"] == [{"job_id": job_id, "task_id": "bozza", "status": "running"}]
    engine.release.set()
    await wait_terminal(client=client, job_id=job_id)
    finished = await client.get(url="/api/v1/jobs/active")
    assert finished.json()["data"] == []
