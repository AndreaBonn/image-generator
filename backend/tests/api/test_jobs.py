import asyncio
import json
from collections.abc import AsyncGenerator, AsyncIterator, Sequence
from pathlib import Path
from typing import Any
from unittest.mock import patch

import httpx
import pytest
from fastapi import FastAPI
from PIL import Image, PngImagePlugin
from pydantic import TypeAdapter
from sqlalchemy import select

from app.api.v1.jobs import get_engine
from app.config import Settings
from app.engine.fake_engine import FakeEngine
from app.engine.types import EngineEvent, EngineRequest, Failed, Generated, Queued, Started
from app.errors import AppError, EngineRejectedError, EngineUnavailableError, OutOfMemoryError
from app.main import create_app
from app.models.records import GenerationRecord

type JobApp = tuple[FastAPI, httpx.AsyncClient]
JOB_STATUS = TypeAdapter(dict[str, Any])


@pytest.fixture
async def job_app(tmp_path: Path) -> AsyncIterator[JobApp]:
    config = Settings(
        engine_mode="fake",
        data_dir=tmp_path,
        styles_dir=tmp_path / "styles",
        model_switch_eta_s=13,
    )
    application = create_app(config=config)
    async with application.router.lifespan_context(application):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=application), base_url="http://test"
        ) as client:
            yield application, client


async def wait_terminal(client: httpx.AsyncClient, job_id: str) -> dict[str, Any]:
    async with asyncio.timeout(delay=5):
        while True:
            response = await client.get(url=f"/api/v1/jobs/{job_id}")
            result = JOB_STATUS.validate_python(response.json()["data"])
            if result["status"] in {"completed", "cancelled", "failed"}:
                return result
            await asyncio.sleep(delay=0.01)


@pytest.mark.parametrize(
    "task_id,batch", [("bozza", 2), ("qualita", 1), ("libero", 1), ("testo", 3)]
)
async def test_jobs_complete_persist_metadata_and_replay_sse(
    job_app: JobApp, task_id: str, batch: int
) -> None:
    application, client = job_app
    response = await client.post(
        url="/api/v1/jobs",
        json={
            "task_id": task_id,
            "prompt": "cat",
            "params": {"seed": 42, "batch": batch, "style_ids": []},
        },
    )
    assert response.status_code == 202
    job_id = response.json()["data"]["job_id"]
    result = await wait_terminal(client=client, job_id=job_id)
    assert result["status"] == "completed", result
    assert len(result["generation_ids"]) == batch
    replay = await client.get(url=f"/api/v1/jobs/{job_id}/events")
    assert "event: completed" in replay.text and result["generation_ids"][0] in replay.text
    with application.state.database.sessions() as session:
        rows = session.scalars(
            select(GenerationRecord)
            .where(GenerationRecord.job_id == job_id)
            .order_by(GenerationRecord.created_at)
        ).all()
    assert [row.seed for row in rows] == ([42, 43, 44] if task_id == "testo" else [42] * batch)
    assert_metadata(rows=rows, data_dir=application.state.settings.data_dir)


def assert_metadata(rows: Sequence[GenerationRecord], data_dir: Path) -> None:
    for row in rows:
        with Image.open(data_dir / row.image_path) as image:
            assert isinstance(image, PngImagePlugin.PngImageFile)
            metadata = json.loads(image.text["studio_immagini"])
            assert image.size == (1152, 896)
            assert metadata["seed"] == row.seed
            assert metadata["params"]["seed"] == row.seed
            assert metadata["prompt"] == "cat"


@pytest.mark.parametrize(
    "error", [EngineRejectedError(), OutOfMemoryError(), EngineUnavailableError()]
)
async def test_jobs_map_engine_failures_and_replay_terminal(
    job_app: JobApp, error: AppError
) -> None:
    application, client = job_app

    class FailingEngine(FakeEngine):
        async def run(self, request: EngineRequest) -> AsyncGenerator[EngineEvent, None]:
            yield Failed(error=error)

    application.dependency_overrides[get_engine] = lambda: FailingEngine()
    response = await client.post(url="/api/v1/jobs", json={"task_id": "bozza", "prompt": "cat"})
    job_id = response.json()["data"]["job_id"]
    result = await wait_terminal(client=client, job_id=job_id)
    assert result["status"] == "failed"
    assert result["error_code"] == error.code
    replay = await client.get(url=f"/api/v1/jobs/{job_id}/events")
    assert "event: failed" in replay.text and error.code in replay.text


async def test_jobs_unexpected_engine_exception_fails_with_generic_internal_error(
    job_app: JobApp,
) -> None:
    application, client = job_app

    class CrashingEngine(FakeEngine):
        async def run(self, request: EngineRequest) -> AsyncGenerator[EngineEvent, None]:
            yield Queued(prompt_id="p")
            yield Started()
            raise RuntimeError("boom: unmapped engine failure")

    application.dependency_overrides[get_engine] = lambda: CrashingEngine()
    response = await client.post(url="/api/v1/jobs", json={"task_id": "bozza", "prompt": "cat"})
    job_id = response.json()["data"]["job_id"]
    result = await wait_terminal(client=client, job_id=job_id)
    assert result["status"] == "failed"
    assert result["error_code"] == "INTERNAL_ERROR"
    assert result["error_message"] == "Si è verificato un errore interno."


async def test_jobs_engine_batch_size_mismatch_fails_as_engine_execution_error(
    job_app: JobApp,
) -> None:
    application, client = job_app

    class ShortBatchEngine(FakeEngine):
        async def run(self, request: EngineRequest) -> AsyncGenerator[EngineEvent, None]:
            async for event in super().run(request=request):
                if isinstance(event, Generated):
                    yield Generated(images=event.images[:-1])
                else:
                    yield event

    application.dependency_overrides[get_engine] = lambda: ShortBatchEngine(step_delay_s=0)
    response = await client.post(
        url="/api/v1/jobs", json={"task_id": "bozza", "prompt": "cat", "params": {"batch": 2}}
    )
    job_id = response.json()["data"]["job_id"]
    result = await wait_terminal(client=client, job_id=job_id)
    assert result["status"] == "failed"
    assert result["error_code"] == "ENGINE_EXECUTION_FAILED"
    assert result["error_message"] == "Il motore ha restituito un numero di immagini inatteso."


async def test_jobs_concurrent_idempotent_submission_returns_single_job(job_app: JobApp) -> None:
    application, client = job_app
    body = {"task_id": "bozza", "prompt": "cat"}
    responses = await asyncio.gather(
        *[
            client.post(url="/api/v1/jobs", json=body, headers={"Idempotency-Key": "same"})
            for _ in range(3)
        ]
    )
    ids = {response.json()["data"]["job_id"] for response in responses}
    assert len(ids) == 1
    result = await wait_terminal(client=client, job_id=ids.pop())
    assert result["status"] == "completed"
    conflict = await client.post(
        url="/api/v1/jobs", json={**body, "prompt": "dog"}, headers={"Idempotency-Key": "same"}
    )
    assert conflict.status_code == 409


async def test_jobs_disk_full_has_no_generation_rows(job_app: JobApp) -> None:
    application, client = job_app
    with patch("app.repositories.image_repository.shutil.disk_usage", return_value=(0, 0, 0)):
        response = await client.post(url="/api/v1/jobs", json={"task_id": "bozza", "prompt": "cat"})
        result = await wait_terminal(client=client, job_id=response.json()["data"]["job_id"])
    assert result["status"] == "failed" and result["error_code"] == "DISK_FULL"
    assert result["generation_ids"] == []
