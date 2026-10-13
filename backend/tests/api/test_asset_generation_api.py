"""/api/v1/assets: generate examples and style previews from the Settings page (I4)."""

import asyncio
import json
from collections.abc import AsyncGenerator
from pathlib import Path
from typing import Any

import httpx
from test_jobs import JobApp
from test_jobs import job_app as job_app

from app.engine.fake_engine import FakeEngine
from app.engine.types import EngineEvent, EngineRequest, Failed
from app.errors import EngineUnavailableError
from app.repositories.asset_repository import AssetRepository

STYLE_NAMES = ["Alpha", "Bravo", "Charlie"]
TERMINAL = {"completed", "failed", "cancelled"}


class HeldEngine(FakeEngine):
    """Fake engine whose runs wait until the test releases them."""

    def __init__(self) -> None:
        super().__init__(step_delay_s=0)
        self.entered = asyncio.Event()
        self.release = asyncio.Event()

    async def run(self, request: EngineRequest) -> AsyncGenerator[EngineEvent, None]:
        self.entered.set()
        await self.release.wait()
        async for event in super().run(request=request):
            yield event


class DownEngine(FakeEngine):
    async def run(self, request: EngineRequest) -> AsyncGenerator[EngineEvent, None]:
        yield Failed(error=EngineUnavailableError())


def _write_styles(styles_dir: Path) -> None:
    styles_dir.mkdir(parents=True, exist_ok=True)
    entries = [{"name": name} for name in STYLE_NAMES]
    (styles_dir / "a.json").write_text(json.dumps(entries), encoding="utf-8")


async def _wait_terminal(client: httpx.AsyncClient) -> dict[str, Any]:
    async with asyncio.timeout(delay=10):
        while True:
            status: dict[str, Any] = (await client.get(url="/api/v1/assets/generation")).json()
            data: dict[str, Any] = status["data"]
            if data["status"] in TERMINAL:
                return data
            await asyncio.sleep(delay=0.01)


async def test_generation_status_is_idle_before_any_run(job_app: JobApp) -> None:
    _, client = job_app

    response = await client.get(url="/api/v1/assets/generation")

    assert response.status_code == 200
    assert response.json() == {
        "data": {"kind": None, "status": "idle", "done": 0, "total": 0, "message": None}
    }


async def test_generate_styles_renders_every_missing_preview(job_app: JobApp) -> None:
    application, client = job_app
    config = application.state.settings
    _write_styles(styles_dir=config.styles_dir)
    application.state.engine = FakeEngine(step_delay_s=0)

    response = await client.post(url="/api/v1/assets/styles/generate")

    assert response.status_code == 202
    final = await _wait_terminal(client=client)
    assert final == {
        "kind": "styles",
        "status": "completed",
        "done": 3,
        "total": 3,
        "message": None,
    }
    repository = AssetRepository(data_dir=config.data_dir)
    assert all(repository.exists(style_name=name) for name in STYLE_NAMES)


async def test_generate_examples_writes_the_manifest(job_app: JobApp) -> None:
    application, client = job_app
    application.state.engine = FakeEngine(step_delay_s=0)

    await client.post(url="/api/v1/assets/examples/generate")

    final = await _wait_terminal(client=client)
    assert final["status"] == "completed", final
    assert final["total"] > 0
    assert final["done"] == final["total"]
    manifest = application.state.settings.data_dir / "examples" / "manifest.json"
    assert len(json.loads(manifest.read_text(encoding="utf-8"))) == final["total"]


async def test_generation_waits_while_a_user_job_holds_the_gpu(job_app: JobApp) -> None:
    application, client = job_app
    _write_styles(styles_dir=application.state.settings.styles_dir)
    engine = HeldEngine()
    engine.release.set()
    application.state.engine = engine
    lock = application.state.job_service.runner.execution_lock

    async with lock:
        await client.post(url="/api/v1/assets/styles/generate")
        await asyncio.sleep(delay=0.05)
        assert not engine.entered.is_set()

    assert (await _wait_terminal(client=client))["status"] == "completed"
    assert engine.entered.is_set()


async def test_second_start_while_running_is_rejected_with_409(job_app: JobApp) -> None:
    application, client = job_app
    _write_styles(styles_dir=application.state.settings.styles_dir)
    engine = HeldEngine()
    application.state.engine = engine
    await client.post(url="/api/v1/assets/styles/generate")
    await asyncio.wait_for(fut=engine.entered.wait(), timeout=5)

    second = await client.post(url="/api/v1/assets/examples/generate")

    assert second.status_code == 409
    assert second.json()["error"]["code"] == "ASSET_GENERATION_IN_PROGRESS"
    engine.release.set()
    assert (await _wait_terminal(client=client))["status"] == "completed"


async def test_cancel_stops_the_run_and_keeps_what_was_not_started(job_app: JobApp) -> None:
    application, client = job_app
    config = application.state.settings
    _write_styles(styles_dir=config.styles_dir)
    engine = HeldEngine()
    application.state.engine = engine
    await client.post(url="/api/v1/assets/styles/generate")
    await asyncio.wait_for(fut=engine.entered.wait(), timeout=5)

    cancelled = await client.post(url="/api/v1/assets/generation/cancel")

    assert cancelled.status_code == 200
    final = await _wait_terminal(client=client)
    assert final["status"] == "cancelled"
    assert final["done"] == 0
    repository = AssetRepository(data_dir=config.data_dir)
    assert not any(repository.exists(style_name=name) for name in STYLE_NAMES)


async def test_engine_failure_ends_the_run_as_failed_with_its_message(job_app: JobApp) -> None:
    application, client = job_app
    _write_styles(styles_dir=application.state.settings.styles_dir)
    application.state.engine = DownEngine(step_delay_s=0)

    await client.post(url="/api/v1/assets/styles/generate")

    final = await _wait_terminal(client=client)
    assert final["status"] == "failed"
    assert final["message"] == EngineUnavailableError.default_message


async def test_unknown_kind_is_a_validation_error(job_app: JobApp) -> None:
    _, client = job_app

    response = await client.post(url="/api/v1/assets/everything/generate")

    assert response.status_code == 422


async def test_generation_forgets_which_model_family_the_runner_had_loaded(job_app: JobApp) -> None:
    application, client = job_app
    _write_styles(styles_dir=application.state.settings.styles_dir)
    application.state.engine = FakeEngine(step_delay_s=0)
    runner = application.state.job_service.runner
    runner.family = "sdxl"

    await client.post(url="/api/v1/assets/styles/generate")

    assert (await _wait_terminal(client=client))["status"] == "completed"
    # The run may have loaded another model: the next job must switch and free memory again.
    assert runner.family is None
