from collections.abc import AsyncIterator
from pathlib import Path

import pytest
from fastapi import FastAPI

from app.config import Settings
from app.engine.fake_engine import FakeEngine
from app.main import create_app
from app.models.job import JobRequest
from app.services.job_run import JobRun
from app.services.job_service import JobService


@pytest.fixture
async def job_service(tmp_path: Path) -> AsyncIterator[JobService]:
    config = Settings(engine_mode="fake", data_dir=tmp_path, styles_dir=tmp_path / "styles")
    application: FastAPI = create_app(config=config)
    async with application.router.lifespan_context(application):
        yield application.state.job_service


async def test_cancel_finishes_a_tracked_run_that_has_no_task_yet(
    job_service: JobService,
) -> None:
    # JobService.cancel() is also meant to handle a run that is tracked in
    # self.runs but whose task hasn't been attached (JobRun.task defaults to
    # None). There is no window in _submit() where another coroutine can
    # observe that state over a real asyncio race (task creation follows the
    # dict insert with no await in between), so this exercises
    # _await_cancellation()'s "no task to join" branch directly instead.
    record, _ = job_service.repository.create(
        request={"task_id": "bozza", "prompt": "cat"}, idempotency_key=None
    )
    resolved = job_service._resolve(request=JobRequest(task_id="bozza", prompt="cat"))
    run = JobRun(id=record.id, job=resolved, engine=FakeEngine(step_delay_s=0), task=None)
    job_service.runs[run.id] = run

    result = await job_service.cancel(job_id=run.id)

    assert result["status"] == "cancelled"
    assert run.id not in job_service.runs
