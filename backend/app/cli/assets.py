"""CLI entry point: `uv run python -m app.cli.assets {styles,examples}`.

`styles` generates the style preview thumbnails that `AssetRepository` is still missing,
one at a time, printing progress and an ETA derived from the styles already done.
`examples` generates the Crea page's first-use examples (AS-P11): two per available
"crea" task without references, writing `DATA_DIR/examples/manifest.json` and skipping
any image already on disk.
"""

import argparse
import asyncio
import dataclasses
import json
import sys
from collections.abc import AsyncIterator, Awaitable, Callable, Sequence
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from pathlib import Path
from time import monotonic

import httpx

from app.config import Settings
from app.engine.comfy_client import ComfyClient
from app.engine.comfy_engine import ComfyEngine
from app.engine.types import EngineClient
from app.engine.workflow_builder import Graph
from app.errors import EngineUnavailableError
from app.repositories.asset_repository import AssetRepository, atomic_write_bytes
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
from app.services.task_catalog import load_catalog, single_workflow_filename

ENGINE_HTTP_TIMEOUT_S = 30
EXAMPLES_DIRNAME = "examples"

EngineFactory = Callable[[Settings], AbstractAsyncContextManager[EngineClient]]


@asynccontextmanager
async def default_engine_factory(settings: Settings) -> AsyncIterator[EngineClient]:
    async with httpx.AsyncClient(
        base_url=settings.comfy_url, timeout=ENGINE_HTTP_TIMEOUT_S, trust_env=False
    ) as http:
        yield ComfyEngine(client=ComfyClient(http=http, config=settings), url=settings.comfy_url)


def _parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="python -m app.cli.assets")
    subparsers = parser.add_subparsers(dest="command", required=True)
    styles_parser = subparsers.add_parser("styles", help="Genera le anteprime stile mancanti.")
    styles_parser.add_argument(
        "--limit", type=int, default=None, help="Genera al massimo N anteprime."
    )
    subparsers.add_parser("examples", help="Genera gli esempi mancanti per Crea.")
    return parser.parse_args(argv)


def _format_progress(index: int, total: int, style_name: str, durations: list[float]) -> str:
    remaining = total - index
    average_s = sum(durations) / len(durations)
    eta_min = round(remaining * average_s / 60)
    return f"{index}/{total} · {style_name} · tempo stimato rimanente {eta_min} min"


async def _generate_missing_previews(
    settings: Settings, engine: EngineClient, limit: int | None
) -> int:
    catalog = load_catalog(settings=settings)
    task = next(candidate for candidate in catalog.tasks if candidate.id == PREVIEW_TASK_ID)
    template_path = settings.workflows_dir / single_workflow_filename(task=task)
    template = json.loads(template_path.read_text(encoding="utf-8"))
    style_service = StyleService(styles=load_styles(directory=settings.styles_dir))
    repository = AssetRepository(data_dir=settings.data_dir)

    targets = missing_styles(styles=style_service.styles, repository=repository)
    if limit is not None:
        targets = targets[:limit]
    if not targets:
        print("Tutte le anteprime richieste sono già presenti.")
        return 0

    durations: list[float] = []
    for index, style in enumerate(targets, start=1):
        started_at = monotonic()
        await generate_style_preview(
            style=style,
            engine=engine,
            task=task,
            template=template,
            style_service=style_service,
            repository=repository,
        )
        durations.append(monotonic() - started_at)
        progress = _format_progress(
            index=index, total=len(targets), style_name=style.name, durations=durations
        )
        print(progress)
    return 0


def _examples_dir(settings: Settings) -> Path:
    return settings.data_dir / EXAMPLES_DIRNAME


def _manifest_path(settings: Settings) -> Path:
    return _examples_dir(settings=settings) / "manifest.json"


def _image_path(settings: Settings, plan: ExamplePlan) -> Path:
    return _examples_dir(settings=settings) / plan.file


def _write_examples_manifest(settings: Settings, plans: Sequence[ExamplePlan]) -> None:
    entries = [dataclasses.asdict(plan) for plan in plans]
    manifest = json.dumps(entries, indent=2, ensure_ascii=False)
    atomic_write_bytes(_manifest_path(settings=settings), manifest.encode("utf-8"))


async def _generate_missing_examples(settings: Settings, engine: EngineClient) -> int:
    """Render every example the manifest is still missing, then (re)write the manifest.

    The plan is already family-ordered (`plan_examples`); templates are read once per
    task and cached, so a run with several missing examples never re-opens a workflow
    file it has already loaded. The manifest is rewritten every run (cheap) so it stays
    a faithful list of what plan_examples currently decides, regardless of what was
    already on disk.
    """
    catalog = load_catalog(settings=settings)
    plans = plan_examples(tasks=catalog.list_tasks())
    if not plans:
        print("Nessun compito disponibile per generare esempi.")
        return 0

    tasks_by_id = {task.id: task for task in catalog.tasks}
    templates: dict[str, Graph] = {}
    missing = [plan for plan in plans if not _image_path(settings=settings, plan=plan).is_file()]
    for index, plan in enumerate(missing, start=1):
        task = tasks_by_id[plan.task_id]
        if plan.task_id not in templates:
            path = settings.workflows_dir / single_workflow_filename(task=task)
            templates[plan.task_id] = json.loads(path.read_text(encoding="utf-8"))
        thumbnail = await generate_example_image(
            plan=plan, engine=engine, task=task, template=templates[plan.task_id]
        )
        atomic_write_bytes(_image_path(settings=settings, plan=plan), thumbnail)
        print(f"{index}/{len(missing)} · {plan.task_id} · esempio generato")
    _write_examples_manifest(settings=settings, plans=plans)
    return 0


async def _run_checked(
    settings: Settings,
    engine_factory: EngineFactory,
    action: Callable[[EngineClient], Awaitable[int]],
) -> int:
    async with engine_factory(settings) as engine:
        try:
            await engine.system_stats()
        except EngineUnavailableError as error:
            print(str(error), file=sys.stderr)
            return 1
        return await action(engine)


async def _run_styles_command(
    settings: Settings, engine_factory: EngineFactory, limit: int | None
) -> int:
    async def action(engine: EngineClient) -> int:
        return await _generate_missing_previews(settings=settings, engine=engine, limit=limit)

    return await _run_checked(settings=settings, engine_factory=engine_factory, action=action)


async def _run_examples_command(settings: Settings, engine_factory: EngineFactory) -> int:
    async def action(engine: EngineClient) -> int:
        return await _generate_missing_examples(settings=settings, engine=engine)

    return await _run_checked(settings=settings, engine_factory=engine_factory, action=action)


def run(argv: Sequence[str], engine_factory: EngineFactory | None = None) -> int:
    args = _parse_args(argv)
    settings = Settings()
    factory = engine_factory if engine_factory is not None else default_engine_factory
    try:
        if args.command == "examples":
            coroutine = _run_examples_command(settings=settings, engine_factory=factory)
        else:
            coroutine = _run_styles_command(
                settings=settings, engine_factory=factory, limit=args.limit
            )
        return asyncio.run(coroutine)
    except KeyboardInterrupt:
        print("\nInterrotto: nessuna anteprima parziale è stata salvata.", file=sys.stderr)
        return 130


def main() -> None:
    sys.exit(run(sys.argv[1:]))


if __name__ == "__main__":
    main()
