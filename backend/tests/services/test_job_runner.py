from collections.abc import AsyncIterator
from pathlib import Path
from time import monotonic

import pytest
from fastapi import FastAPI

from app.config import Settings
from app.engine.fake_engine import FakeEngine
from app.main import create_app
from app.models.job import JobRequest
from app.services.job_execution import JobInterruptedError
from app.services.job_run import JobRun
from app.services.job_service import JobService

# JobRunner._execute()/._save() each open with a cooperative "was this run
# already marked cancelled?" guard (app/services/job_runner.py). Once a real
# asyncio CancelledError has reached a *running* task, JobRunner.run() already
# catches it (see test_job_cancellation.py). These two guards instead cover a
# run whose `is_cancelled` flag flips *before* the runner ever starts touching
# it -- not reachable by racing a real cancellation against the fake engine,
# so they are exercised directly.


@pytest.fixture
async def job_service(tmp_path: Path) -> AsyncIterator[JobService]:
    config = Settings(engine_mode="fake", data_dir=tmp_path, fooocus_dir=tmp_path / "fooocus")
    application: FastAPI = create_app(config=config)
    async with application.router.lifespan_context(application):
        yield application.state.job_service


def _pre_cancelled_run(service: JobService) -> JobRun:
    record, _ = service.repository.create(
        request={"task_id": "bozza", "prompt": "cat"}, idempotency_key=None
    )
    resolved = service._resolve(request=JobRequest(task_id="bozza", prompt="cat"))
    return JobRun(id=record.id, job=resolved, engine=FakeEngine(step_delay_s=0), is_cancelled=True)


async def test_guard_execution_pre_cancelled_run_finishes_cancelled_without_touching_engine(
    job_service: JobService,
) -> None:
    run = _pre_cancelled_run(service=job_service)
    job_service.runner.family = "sdxl"  # prove the reset below actually happens
    await job_service.runner._guard_execution(run=run)
    status = await job_service.status(job_id=run.id)
    assert status["status"] == "cancelled"
    assert job_service.runner.family is None
    # FakeEngine.run() only sets its own .family once it has actually produced
    # an image; still None proves _execute's guard returned before the engine
    # was ever invoked (the later guard in _save() would also yield
    # "cancelled" on its own, so this is the assertion that pins the right one).
    engine = run.engine
    assert isinstance(engine, FakeEngine)
    assert engine.family is None


async def test_save_raises_interrupted_when_run_cancelled_before_completion_lock(
    job_service: JobService,
) -> None:
    run = _pre_cancelled_run(service=job_service)
    with pytest.raises(JobInterruptedError):
        await job_service.runner._save(run=run, outputs=[], started=monotonic())
    status = await job_service.status(job_id=run.id)
    # Nothing was persisted: _save must have raised before building the batch.
    assert status["generation_ids"] == []
