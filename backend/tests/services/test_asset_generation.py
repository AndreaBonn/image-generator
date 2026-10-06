import asyncio
import json
import re
from collections import Counter
from collections.abc import AsyncGenerator, Callable
from io import BytesIO
from pathlib import Path
from typing import Any, cast

import pytest
import yaml
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
    EXAMPLES_PER_TASK,
    FIXED_PROMPT,
    PREVIEW_STEPS,
    PREVIEW_TASK_ID,
    generate_style_preview,
    missing_styles,
    plan_examples,
)
from app.services.style_service import StyleService
from app.services.task_catalog import load_catalog

# Same model set as tests/services/test_task_catalog.py's catalog_settings, extended to
# every model the "crea" tasks without references need, so plan_examples has something
# real to filter.
EXAMPLE_MODEL_IDS = {
    "juggernaut_xl_v8",
    "sdxl_lightning_lora",
    "sdxl_offset_lora",
    "flux2_klein_4b",
    "qwen3_4b_fp4",
    "flux2_vae",
    "zimage_turbo",
    "zimage_vae",
}


def _copy_catalog_config(tmp_path: Path) -> Path:
    config_dir = tmp_path / "config"
    config_dir.mkdir()
    for name in ("tasks.yaml", "models.yaml"):
        (config_dir / name).write_text(
            (REPO_ROOT / "config" / name).read_text(encoding="utf-8"), encoding="utf-8"
        )
    return config_dir


read_yaml = cast(Callable[[str], object], yaml.safe_load)


def _touch_models(settings: Settings, model_ids: set[str]) -> None:
    models = cast(
        dict[str, list[dict[str, str]]],
        read_yaml((settings.config_dir / "models.yaml").read_text(encoding="utf-8")),
    )
    for model in models["models"]:
        if model["id"] not in model_ids:
            continue
        path = settings.models_dir / model["folder"] / model["filename"]
        path.parent.mkdir(parents=True, exist_ok=True)
        path.touch()


@pytest.fixture
def available_example_tasks(tmp_path: Path) -> list[Any]:
    """TaskView list where bozza/qualita/testo/foto (and the reference tasks sharing
    their models) are available, so plan_examples has real candidates to filter.
    """
    settings = Settings(
        config_dir=_copy_catalog_config(tmp_path),
        workflows_dir=REPO_ROOT / "workflows",
        styles_dir=tmp_path / "styles",
        models_dir=tmp_path / "models",
    )
    _touch_models(settings=settings, model_ids=EXAMPLE_MODEL_IDS)
    return load_catalog(settings=settings).list_tasks()


@pytest.fixture
def unavailable_example_tasks(tmp_path: Path) -> list[Any]:
    """Same catalog, no model touched: every task is unavailable."""
    settings = Settings(
        config_dir=_copy_catalog_config(tmp_path),
        workflows_dir=REPO_ROOT / "workflows",
        styles_dir=tmp_path / "styles",
        models_dir=tmp_path / "models",
    )
    return load_catalog(settings=settings).list_tasks()


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


CREA_TASK_IDS_WITHOUT_REFERENCES = {"bozza", "qualita", "testo", "foto"}
REFERENCE_TASK_IDS = {"da_schizzo", "in_posa", "crea_da_riferimenti"}


def test_plan_examples_has_two_entries_per_available_crea_task_without_references(
    available_example_tasks: list[Any],
) -> None:
    plan = plan_examples(tasks=available_example_tasks)

    counts = Counter(entry.task_id for entry in plan)
    assert set(counts) == CREA_TASK_IDS_WITHOUT_REFERENCES
    assert all(count == EXAMPLES_PER_TASK for count in counts.values())


def test_plan_examples_excludes_tasks_with_workflow_by_reference_count(
    available_example_tasks: list[Any],
) -> None:
    plan = plan_examples(tasks=available_example_tasks)

    assert {entry.task_id for entry in plan}.isdisjoint(REFERENCE_TASK_IDS)


def test_plan_examples_excludes_unavailable_tasks(unavailable_example_tasks: list[Any]) -> None:
    plan = plan_examples(tasks=unavailable_example_tasks)

    assert plan == []


def test_plan_examples_entries_use_the_task_default_aspect_ratio(
    available_example_tasks: list[Any],
) -> None:
    plan = plan_examples(tasks=available_example_tasks)

    for entry in plan:
        assert entry.aspect_ratio == "1152*896"
        assert (entry.width, entry.height) == (1152, 896)


def test_plan_examples_entries_take_the_first_two_prompt_examples(
    available_example_tasks: list[Any],
) -> None:
    tasks_by_id = {task.id: task for task in available_example_tasks}
    plan = plan_examples(tasks=available_example_tasks)

    for entry in plan:
        task = tasks_by_id[entry.task_id]
        assert entry.prompt in task.prompt_examples[:EXAMPLES_PER_TASK]


def test_plan_examples_ids_are_stable_16_hex_and_file_matches(
    available_example_tasks: list[Any],
) -> None:
    first = plan_examples(tasks=available_example_tasks)
    second = plan_examples(tasks=available_example_tasks)

    assert [entry.id for entry in first] == [entry.id for entry in second]
    for entry in first:
        assert re.fullmatch(r"[0-9a-f]{16}", entry.id)
        assert entry.file == f"{entry.id}.webp"


def test_plan_examples_orders_entries_by_model_family(
    available_example_tasks: list[Any],
) -> None:
    families_by_task = {task.id: task.family for task in available_example_tasks}
    plan = plan_examples(tasks=available_example_tasks)

    families_in_order: list[str] = []
    for entry in plan:
        family = families_by_task[entry.task_id]
        if not families_in_order or families_in_order[-1] != family:
            families_in_order.append(family)

    assert len(families_in_order) == len(set(families_in_order))


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
