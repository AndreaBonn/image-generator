"""Generate the missing style previews and first-use examples, reporting progress.

Shared by the CLI (`app.cli.assets`, which prints) and the Settings page (`AssetJobs`,
which keeps a status the UI polls), so both write exactly the same files.
"""

import dataclasses
import json
from collections.abc import Callable, Sequence
from contextlib import AbstractAsyncContextManager, nullcontext
from pathlib import Path
from typing import Any, Protocol

from app.config import Settings
from app.engine.types import EngineClient
from app.engine.workflow_builder import Graph
from app.models.task import TaskDefinition
from app.repositories.asset_repository import EXAMPLES_DIRNAME, AssetRepository, atomic_write_bytes
from app.repositories.style_repository import load_styles
from app.services.asset_generation import (
    PREVIEW_TASK_ID,
    ExamplePlan,
    generate_example_image,
    generate_style_preview,
    missing_styles,
    plan_examples,
)
from app.services.style_service import StyleService
from app.services.task_catalog import TaskCatalog, load_catalog, single_workflow_filename

# Opens one GPU turn per image: the job runner's `foreign_turn` when called from the app.
GpuTurn = Callable[[], AbstractAsyncContextManager[Any]]


class AssetProgress(Protocol):
    def started(self, total: int) -> None: ...

    def advanced(self, done: int, total: int, label: str) -> None: ...


def _find_task(catalog: TaskCatalog, task_id: str) -> TaskDefinition:
    return next(task for task in catalog.tasks if task.id == task_id)


def _gpu_turn_or_noop(gpu_turn: GpuTurn | None) -> AbstractAsyncContextManager[Any]:
    return gpu_turn() if gpu_turn is not None else nullcontext()


def _load_template(settings: Settings, task: TaskDefinition) -> Graph:
    path = settings.workflows_dir / single_workflow_filename(task=task)
    template: Graph = json.loads(path.read_text(encoding="utf-8"))
    return template


async def generate_missing_previews(
    settings: Settings,
    engine: EngineClient,
    progress: AssetProgress,
    *,
    limit: int | None = None,
    gpu_turn: GpuTurn | None = None,
) -> int:
    """Render every style preview still missing, one image per `gpu_turn`; returns how many.

    One `gpu_turn` per image, not for the whole run, lets a user's job slip in between
    two previews.
    """
    task = _find_task(catalog=load_catalog(settings=settings), task_id=PREVIEW_TASK_ID)
    template = _load_template(settings=settings, task=task)
    style_service = StyleService(styles=load_styles(directory=settings.styles_dir))
    repository = AssetRepository(data_dir=settings.data_dir)
    targets = missing_styles(styles=style_service.styles, repository=repository)
    targets = targets[:limit] if limit is not None else targets
    progress.started(total=len(targets))
    for index, style in enumerate(targets, start=1):
        async with _gpu_turn_or_noop(gpu_turn=gpu_turn):
            await generate_style_preview(
                style=style,
                engine=engine,
                task=task,
                template=template,
                style_service=style_service,
                repository=repository,
            )
        progress.advanced(done=index, total=len(targets), label=style.name)
    return len(targets)


def examples_dir(settings: Settings) -> Path:
    return settings.data_dir / EXAMPLES_DIRNAME


def _image_path(settings: Settings, plan: ExamplePlan) -> Path:
    return examples_dir(settings=settings) / plan.file


def _write_examples_manifest(settings: Settings, plans: Sequence[ExamplePlan]) -> None:
    entries = [dataclasses.asdict(plan) for plan in plans]
    manifest = json.dumps(entries, indent=2, ensure_ascii=False)
    atomic_write_bytes(examples_dir(settings=settings) / "manifest.json", manifest.encode("utf-8"))


async def generate_missing_examples(
    settings: Settings,
    engine: EngineClient,
    progress: AssetProgress,
    *,
    gpu_turn: GpuTurn | None = None,
) -> int:
    """Render every example image still missing, then (re)write the manifest; returns how many.

    The plan is family-ordered (`plan_examples`) and templates are read once per task.
    The manifest is rewritten every run (cheap) so it always lists what `plan_examples`
    decides today, whatever was already on disk.
    """
    catalog = load_catalog(settings=settings)
    plans = plan_examples(tasks=catalog.list_tasks())
    missing = [plan for plan in plans if not _image_path(settings=settings, plan=plan).is_file()]
    progress.started(total=len(missing))
    templates: dict[str, Graph] = {}
    for index, plan in enumerate(missing, start=1):
        task = _find_task(catalog=catalog, task_id=plan.task_id)
        if plan.task_id not in templates:
            templates[plan.task_id] = _load_template(settings=settings, task=task)
        async with _gpu_turn_or_noop(gpu_turn=gpu_turn):
            thumbnail = await generate_example_image(
                plan=plan, engine=engine, task=task, template=templates[plan.task_id]
            )
        atomic_write_bytes(_image_path(settings=settings, plan=plan), thumbnail)
        progress.advanced(done=index, total=len(missing), label=plan.task_id)
    if plans:
        _write_examples_manifest(settings=settings, plans=plans)
    return len(missing)
