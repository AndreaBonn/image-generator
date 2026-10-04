import asyncio
from dataclasses import replace
from threading import Event
from typing import Any
from unittest.mock import AsyncMock

import pytest
from test_jobs import JobApp, wait_terminal
from test_jobs import job_app as job_app

import app.repositories.job_repository as job_repository_module
from app.api.v1.jobs import get_engine
from app.engine.fake_engine import FakeEngine
from app.errors import DiskFullError


async def test_later_image_failure_rolls_back_batch_files_and_records(
    job_app: JobApp, monkeypatch: pytest.MonkeyPatch
) -> None:
    application, client = job_app
    repository = application.state.job_service.resources.images
    original = repository.save
    calls = 0

    def save(**kwargs: Any) -> Any:
        nonlocal calls
        calls += 1
        if calls == 2:
            raise DiskFullError()
        return original(**kwargs)

    monkeypatch.setattr(repository, "save", save)
    response = await client.post(
        "/api/v1/jobs", json={"task_id": "bozza", "prompt": "cat", "params": {"batch": 2}}
    )
    result = await wait_terminal(client=client, job_id=response.json()["data"]["job_id"])
    assert calls == 2
    assert result["error_code"] == "DISK_FULL" and result["generation_ids"] == []
    assert list(application.state.settings.data_dir.rglob("*.png")) == []


async def test_timeout_during_image_write_rolls_back_and_interrupts(
    job_app: JobApp, monkeypatch: pytest.MonkeyPatch
) -> None:
    application, client = job_app
    service = application.state.job_service
    service.runner.resources = replace(
        service.resources,
        settings=service.resources.settings.model_copy(update={"job_timeout_s": 1}),
    )
    engine = FakeEngine(step_delay_s=0)
    interrupt = AsyncMock(wraps=engine.interrupt)
    monkeypatch.setattr(engine, "interrupt", interrupt)
    application.dependency_overrides[get_engine] = lambda: engine
    images = service.resources.images
    original_save = images.save
    release = Event()

    def blocked_save(**kwargs: Any) -> Any:
        assert release.wait(timeout=10)
        return original_save(**kwargs)

    async def release_once_timeout_fires(job_id: str) -> None:
        # The shielded writer must finish before job_runner's drain_task() lets the
        # timeout propagate, so release on the cancellation being delivered to the
        # job task, not on the job settling (that would deadlock).
        async with asyncio.timeout(delay=5):
            while (task := service.runs[job_id].task) is None or not task.cancelling():
                await asyncio.sleep(delay=0.01)
        release.set()

    monkeypatch.setattr(images, "save", blocked_save)
    response = await client.post("/api/v1/jobs", json={"task_id": "bozza", "prompt": "cat"})
    job_id = response.json()["data"]["job_id"]
    releaser = asyncio.create_task(coro=release_once_timeout_fires(job_id=job_id))
    try:
        result = await wait_terminal(client=client, job_id=job_id)
    finally:
        release.set()
        await releaser
    assert result["status"] == "failed" and result["error_code"] == "JOB_TIMEOUT"
    interrupt.assert_awaited_once()
    assert result["generation_ids"] == []


async def test_repository_deadline_exceeded_during_commit_fails_as_job_timeout(
    job_app: JobApp, monkeypatch: pytest.MonkeyPatch
) -> None:
    application, client = job_app
    service = application.state.job_service
    # job_timeout_s stays large so asyncio.timeout never fires for real: only the
    # repository's own deadline check (job_repository.py complete()) must raise,
    # isolated from the generic asyncio-timeout path covered above.
    service.runner.resources = replace(
        service.resources,
        settings=service.resources.settings.model_copy(update={"job_timeout_s": 60}),
    )
    engine = FakeEngine(step_delay_s=0)
    interrupt = AsyncMock(wraps=engine.interrupt)
    monkeypatch.setattr(engine, "interrupt", interrupt)
    application.dependency_overrides[get_engine] = lambda: engine
    monkeypatch.setattr(job_repository_module, "monotonic", lambda: float("inf"))
    response = await client.post("/api/v1/jobs", json={"task_id": "bozza", "prompt": "cat"})
    result = await wait_terminal(client=client, job_id=response.json()["data"]["job_id"])
    assert result["status"] == "failed" and result["error_code"] == "JOB_TIMEOUT"
    interrupt.assert_awaited_once()
    assert result["generation_ids"] == []
    assert list(application.state.settings.data_dir.rglob("*.png")) == []
