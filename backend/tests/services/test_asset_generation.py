import asyncio
import json
from collections.abc import AsyncGenerator
from io import BytesIO
from pathlib import Path
from typing import Any, cast

import pytest
from PIL import Image

from app.config import REPO_ROOT, Settings
from app.engine.fake_engine import FakeEngine
from app.engine.types import EngineEvent, EngineRequest, Failed, Queued
from app.engine.workflow_builder import Graph
from app.errors import EngineRejectedError
from app.models.style import Style
from app.models.task import TaskDefinition
from app.repositories.asset_repository import AssetRepository
from app.repositories.catalog_repository import CatalogRepository
from app.services.asset_generation import (
    FIXED_PROMPT,
    PREVIEW_STEPS,
    PREVIEW_TASK_ID,
    generate_style_preview,
    missing_styles,
)
from app.services.style_service import StyleService


@pytest.fixture
def bozza_task() -> TaskDefinition:
    settings = Settings(config_dir=REPO_ROOT / "config", styles_dir=REPO_ROOT / "data/styles")
    tasks = CatalogRepository(settings=settings).read_tasks().tasks
    return next(task for task in tasks if task.id == PREVIEW_TASK_ID)


@pytest.fixture
def bozza_template(bozza_task: TaskDefinition) -> Graph:
    assert bozza_task.workflow is not None
    path = REPO_ROOT / "workflows" / bozza_task.workflow
    return cast(Graph, json.loads(path.read_text(encoding="utf-8")))


def titled_nodes(graph: Graph) -> dict[str, dict[str, Any]]:
    return {
        node["_meta"]["title"]: node
        for node in graph.values()
        if "_meta" in node and node["_meta"].get("title")
    }


class CapturingEngine(FakeEngine):
    def __init__(self) -> None:
        super().__init__(step_delay_s=0)
        self.captured: EngineRequest | None = None

    async def run(self, request: EngineRequest) -> AsyncGenerator[EngineEvent, None]:
        self.captured = request
        async for event in super().run(request=request):
            yield event


def test_missing_styles_returns_only_styles_without_a_saved_preview(tmp_path: Path) -> None:
    repository = AssetRepository(data_dir=tmp_path)
    styles = tuple(Style(name=f"Style {index}") for index in range(5))
    for style in styles[:3]:
        repository.save(style_name=style.name, content=b"existing-preview")

    result = missing_styles(styles=styles, repository=repository)

    assert [style.name for style in result] == ["Style 3", "Style 4"]


async def test_generate_style_preview_saves_a_256px_webp_thumbnail(
    tmp_path: Path, bozza_task: TaskDefinition, bozza_template: Graph
) -> None:
    style = Style(name="Cinematic", prompt="cinematic still, {prompt}", negative_prompt="blurry")
    repository = AssetRepository(data_dir=tmp_path)
    style_service = StyleService(styles=(style,))

    await generate_style_preview(
        style=style,
        engine=FakeEngine(step_delay_s=0),
        task=bozza_task,
        template=bozza_template,
        style_service=style_service,
        repository=repository,
    )

    assert repository.exists(style_name=style.name) is True
    with Image.open(fp=BytesIO(repository.path_for(style_name=style.name).read_bytes())) as image:
        image.load()
        assert image.format == "WEBP"
        assert max(image.size) == 256


async def test_generate_style_preview_binds_the_fixed_prompt_through_the_style(
    tmp_path: Path, bozza_task: TaskDefinition, bozza_template: Graph
) -> None:
    style = Style(name="Cinematic", prompt="cinematic still, {prompt}", negative_prompt="blurry")
    repository = AssetRepository(data_dir=tmp_path)
    style_service = StyleService(styles=(style,))
    engine = CapturingEngine()

    await generate_style_preview(
        style=style,
        engine=engine,
        task=bozza_task,
        template=bozza_template,
        style_service=style_service,
        repository=repository,
    )

    assert engine.captured is not None
    titles = titled_nodes(graph=engine.captured.graph)
    assert titles["@prompt_pos"]["inputs"]["text"] == f"cinematic still, {FIXED_PROMPT}"
    assert titles["@prompt_neg"]["inputs"]["text"] == "blurry"
    assert (engine.captured.width, engine.captured.height) == (1024, 1024)
    # Lightning (bozza) ignores most style text; qualita at 12 steps shows it (docs/benchmark.md).
    assert PREVIEW_TASK_ID == "qualita"
    assert titles["@sampler"]["inputs"]["steps"] == PREVIEW_STEPS


async def test_generate_style_preview_propagates_engine_failure(
    tmp_path: Path, bozza_task: TaskDefinition, bozza_template: Graph
) -> None:
    style = Style(name="Cinematic")
    repository = AssetRepository(data_dir=tmp_path)
    style_service = StyleService(styles=(style,))
    error = EngineRejectedError(message="Test engine rejected the request")

    class FailingEngine(FakeEngine):
        async def run(self, request: EngineRequest) -> AsyncGenerator[EngineEvent, None]:
            yield Failed(error=error)

    with pytest.raises(EngineRejectedError) as raised:
        await generate_style_preview(
            style=style,
            engine=FailingEngine(step_delay_s=0),
            task=bozza_task,
            template=bozza_template,
            style_service=style_service,
            repository=repository,
        )

    assert raised.value is error
    assert repository.exists(style_name=style.name) is False


class HangingEngine(FakeEngine):
    """Accepts the request, then never finishes: stands in for a long ComfyUI run."""

    def __init__(self) -> None:
        super().__init__(step_delay_s=0)
        self.started = asyncio.Event()
        self.interrupted = False

    async def run(self, request: EngineRequest) -> AsyncGenerator[EngineEvent, None]:
        yield Queued(prompt_id="p")
        self.started.set()
        await asyncio.Event().wait()
        yield Queued(prompt_id="unreachable")

    async def interrupt(self) -> None:
        self.interrupted = True


async def test_cancelling_a_preview_mid_run_interrupts_the_engine(
    tmp_path: Path, bozza_task: TaskDefinition, bozza_template: Graph
) -> None:
    style = Style(name="Cinematic")
    engine = HangingEngine()
    task = asyncio.create_task(
        generate_style_preview(
            style=style,
            engine=engine,
            task=bozza_task,
            template=bozza_template,
            style_service=StyleService(styles=(style,)),
            repository=AssetRepository(data_dir=tmp_path),
        )
    )
    await engine.started.wait()

    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    assert engine.interrupted
