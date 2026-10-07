import asyncio
import hashlib
import logging
from collections.abc import Sequence
from contextlib import aclosing
from dataclasses import dataclass, field
from io import BytesIO

from PIL import Image

from app.engine.types import EngineClient, EngineRequest, Failed, Generated, Interrupted
from app.engine.workflow_builder import Graph, build_workflow
from app.errors import AppError, EngineExecutionError
from app.models.style import Style
from app.models.task import Scalar, TaskDefinition, TaskView
from app.repositories.asset_repository import HASH_LENGTH, AssetRepository
from app.services.style_service import StyleService

logger = logging.getLogger(__name__)

# AS-P9: one fixed prompt and seed for every style, so previews only vary by
# style and stay comparable to each other.
FIXED_PROMPT = "a woman sitting by a window with a cup of tea"
FIXED_SEED = 1
# SDXL Lightning (bozza, CFG 1) barely follows style text, so previews of "Action Figure" or
# "3D Character" came out as plain photos; qualita shows the style already at 12 steps (~13 s).
PREVIEW_TASK_ID = "qualita"
PREVIEW_STEPS = 12
PREVIEW_SIDE = 1024
THUMBNAIL_SIDE = 256

# AS-P11 / O10: two examples per eligible task, kept deterministic with fixed seeds so the
# same catalog always plans the same manifest (idempotent re-runs, stable ids).
EXAMPLES_PER_TASK = 2
EXAMPLE_SEEDS = (1, 2)
EXAMPLE_THUMBNAIL_SIDE = 768


class StylePreviewInterruptedError(Exception):
    pass


class ExampleGenerationInterruptedError(Exception):
    pass


def missing_styles(styles: Sequence[Style], repository: AssetRepository) -> tuple[Style, ...]:
    return tuple(style for style in styles if not repository.exists(style_name=style.name))


def render_thumbnail(image: bytes, max_side: int = THUMBNAIL_SIDE) -> bytes:
    output = BytesIO()
    with Image.open(fp=BytesIO(image)) as source:
        preview = source.convert(mode="RGB")
        preview.thumbnail(size=(max_side, max_side))
        preview.save(fp=output, format="WEBP")
    return output.getvalue()


@dataclass(frozen=True)
class ExamplePlan:
    """One manifest entry: a fixed (task, prompt, seed) a local example image renders from."""

    id: str
    task_id: str
    prompt: str
    seed: int
    aspect_ratio: str
    width: int
    height: int
    file: str = field(init=False)

    def __post_init__(self) -> None:
        object.__setattr__(self, "file", f"{self.id}.webp")


def _example_id(task_id: str, prompt: str, seed: int) -> str:
    digest = hashlib.sha256(f"{task_id}\n{prompt}\n{seed}".encode()).hexdigest()
    return digest[:HASH_LENGTH]


def _is_example_candidate(task: TaskView) -> bool:
    return task.group == "crea" and task.workflow_by_reference_count is None and task.available


def _default_aspect_ratio(task: TaskDefinition) -> tuple[str, int, int]:
    default_id = task.defaults.get("aspect_ratio")
    ratio = next(ratio for ratio in task.aspect_ratios if ratio.id == default_id)
    return ratio.id, ratio.width, ratio.height


def plan_examples(tasks: Sequence[TaskView]) -> list[ExamplePlan]:
    """Two examples per available "crea" task without references, grouped by model
    family so the CLI generates them without switching models back and forth.
    """
    candidates = sorted(
        (task for task in tasks if _is_example_candidate(task=task)),
        key=lambda task: (task.family, task.id),
    )
    plan: list[ExamplePlan] = []
    for task in candidates:
        aspect_ratio, width, height = _default_aspect_ratio(task=task)
        prompts = task.prompt_examples[:EXAMPLES_PER_TASK]
        for prompt, seed in zip(prompts, EXAMPLE_SEEDS, strict=True):
            plan.append(
                ExamplePlan(
                    id=_example_id(task_id=task.id, prompt=prompt, seed=seed),
                    task_id=task.id,
                    prompt=prompt,
                    seed=seed,
                    aspect_ratio=aspect_ratio,
                    width=width,
                    height=height,
                )
            )
    return plan


def build_example_graph(task: TaskDefinition, template: Graph, plan: ExamplePlan) -> Graph:
    values: dict[str, Scalar] = {
        "prompt": plan.prompt,
        "negative_prompt": "",
        "seed": plan.seed,
        "steps": task.defaults["steps"],
        "cfg": task.defaults["cfg"],
        "width": plan.width,
        "height": plan.height,
        "batch": 1,
    }
    return build_workflow(template=template, bindings=task.bindings, values=values)


async def _interrupt_quietly(engine: EngineClient) -> None:
    try:
        await engine.interrupt()
    except AppError:
        logger.exception("Engine interrupt failed while cancelling an asset generation")


async def _run_to_single_image(
    engine: EngineClient,
    request: EngineRequest,
    *,
    interrupted_error: type[Exception],
    interrupted_message: str,
) -> bytes | None:
    """Drive one engine run to completion and return its single output image, if any."""
    image: bytes | None = None
    async with aclosing(engine.run(request=request)) as stream:
        async for event in stream:
            if isinstance(event, Failed):
                raise event.error
            if isinstance(event, Interrupted):
                raise interrupted_error(interrupted_message)
            if isinstance(event, Generated):
                image = event.images[0]
    return image


async def _collect_image(
    engine: EngineClient,
    request: EngineRequest,
    *,
    interrupted_error: type[Exception],
    interrupted_message: str,
    missing_image_message: str,
) -> bytes:
    """Drive one engine run to completion and return its single output image.

    Shared by style previews and examples: both send one request and want the
    first (only) generated image, erroring out the same way on failure,
    interruption, or an engine that completes without producing anything.
    """
    try:
        image = await _run_to_single_image(
            engine=engine,
            request=request,
            interrupted_error=interrupted_error,
            interrupted_message=interrupted_message,
        )
    except asyncio.CancelledError:
        # Ctrl+C in the CLI cancels this coroutine; without an interrupt the prompt
        # keeps running on the GPU after the CLI has exited (same as JobRunner._stop).
        await _interrupt_quietly(engine=engine)
        raise
    if image is None:
        raise EngineExecutionError(message=missing_image_message)
    return image


async def generate_example_image(
    plan: ExamplePlan, *, engine: EngineClient, task: TaskDefinition, template: Graph
) -> bytes:
    """Render one example and return its WEBP thumbnail bytes (not saved to disk)."""
    graph = build_example_graph(task=task, template=template, plan=plan)
    request = EngineRequest(
        graph=graph,
        family=task.family,
        width=plan.width,
        height=plan.height,
        seed=plan.seed,
        batch=1,
    )
    image = await _collect_image(
        engine=engine,
        request=request,
        interrupted_error=ExampleGenerationInterruptedError,
        interrupted_message=f"Esempio per {plan.task_id} interrotto.",
        missing_image_message=(
            f"Il motore non ha restituito un'immagine per l'esempio {plan.task_id}."
        ),
    )
    return await asyncio.to_thread(render_thumbnail, image, EXAMPLE_THUMBNAIL_SIDE)


def build_preview_graph(
    task: TaskDefinition, template: Graph, prompt: str, negative: str, seed: int
) -> Graph:
    values: dict[str, Scalar] = {
        "prompt": prompt,
        "negative_prompt": negative,
        "seed": seed,
        "steps": PREVIEW_STEPS,
        "cfg": task.defaults["cfg"],
        "width": PREVIEW_SIDE,
        "height": PREVIEW_SIDE,
        "batch": 1,
    }
    return build_workflow(template=template, bindings=task.bindings, values=values)


async def generate_style_preview(
    style: Style,
    *,
    engine: EngineClient,
    task: TaskDefinition,
    template: Graph,
    style_service: StyleService,
    repository: AssetRepository,
    prompt: str = FIXED_PROMPT,
    seed: int = FIXED_SEED,
) -> None:
    styled_prompt, styled_negative = style_service.apply_styles(
        prompt=prompt, negative="", style_ids=[style.name]
    )
    graph = build_preview_graph(
        task=task, template=template, prompt=styled_prompt, negative=styled_negative, seed=seed
    )
    request = EngineRequest(
        graph=graph, family=task.family, width=PREVIEW_SIDE, height=PREVIEW_SIDE, seed=seed, batch=1
    )
    image = await _collect_image(
        engine=engine,
        request=request,
        interrupted_error=StylePreviewInterruptedError,
        interrupted_message=f"Anteprima di {style.name} interrotta.",
        missing_image_message=f"Il motore non ha restituito un'immagine per lo stile {style.name}.",
    )
    thumbnail = await asyncio.to_thread(render_thumbnail, image)
    repository.save(style_name=style.name, content=thumbnail)
