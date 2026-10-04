import time
from dataclasses import replace
from typing import Any

import pytest
from test_jobs import JobApp, wait_terminal
from test_jobs import job_app as job_app

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


@pytest.mark.parametrize("boundary", ["image", "transaction"])
async def test_timeout_during_save_rolls_back_and_interrupts(
    job_app: JobApp, monkeypatch: pytest.MonkeyPatch, boundary: str
) -> None:
    from unittest.mock import AsyncMock

    application, client = job_app
    service = application.state.job_service
    service.runner.resources = replace(
        service.resources,
        settings=service.resources.settings.model_copy(update={"job_timeout_s": 1}),
    )
    engine = FakeEngine(step_delay_s=0)
    engine.interrupt = AsyncMock(wraps=engine.interrupt)
    application.dependency_overrides[get_engine] = lambda: engine
    target = service.resources.images if boundary == "image" else service.repository
    method = "save" if boundary == "image" else "complete"
    original = getattr(target, method)

    def slow_save(**kwargs: Any) -> Any:
        time.sleep(1.1)
        return original(**kwargs)

    monkeypatch.setattr(target, method, slow_save)
    response = await client.post("/api/v1/jobs", json={"task_id": "bozza", "prompt": "cat"})
    result = await wait_terminal(client=client, job_id=response.json()["data"]["job_id"])
    assert result["status"] == "failed" and result["error_code"] == "JOB_TIMEOUT"
    engine.interrupt.assert_awaited_once()
    assert result["generation_ids"] == []
