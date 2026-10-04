from collections.abc import Awaitable, Callable
from contextlib import aclosing
from dataclasses import dataclass

from app.engine.types import (
    EngineClient,
    EngineEvent,
    EngineRequest,
    Failed,
    Generated,
    Interrupted,
)
from app.engine.workflow_builder import Graph, build_workflow
from app.errors import EngineExecutionError
from app.models.job import ResolvedJob
from app.services.image_preparation import upload_job_images


class JobInterruptedError(Exception):
    pass


@dataclass(frozen=True, kw_only=True)
class GenerationOutput:
    image: bytes
    seed: int
    batch_index: int


def build_requests(job: ResolvedJob, template: Graph) -> list[EngineRequest]:
    is_native_batch = job.task.family == "sdxl"
    count = 1 if is_native_batch else job.params.batch
    batch = job.params.batch if is_native_batch else 1
    requests = []
    for offset in range(count):
        values = job.params.model_dump(exclude={"style_ids"})
        values.update(
            prompt=job.prompt_final,
            negative_prompt=job.negative_final,
            seed=job.params.seed + offset,
            batch=batch,
        )
        values.update(job.binding_values)
        graph = build_workflow(template=template, bindings=job.task.bindings, values=values)
        requests.append(
            EngineRequest(
                graph=graph,
                family=job.task.family,
                width=job.params.width,
                height=job.params.height,
                seed=job.params.seed + offset,
                batch=batch,
            )
        )
    return requests


async def execute_job(
    job: ResolvedJob,
    engine: EngineClient,
    template: Graph,
    on_event: Callable[[EngineEvent], Awaitable[None]],
) -> list[GenerationOutput]:
    job = await upload_job_images(job=job, engine=engine)
    results: list[GenerationOutput] = []
    for request in build_requests(job=job, template=template):
        images: tuple[bytes, ...] = ()
        async with aclosing(engine.run(request=request)) as stream:
            async for event in stream:
                if isinstance(event, Failed):
                    raise event.error
                if isinstance(event, Interrupted):
                    raise JobInterruptedError()
                if isinstance(event, Generated):
                    images = event.images
                await on_event(event)
        if len(images) != request.batch:
            raise EngineExecutionError(
                message="Il motore ha restituito un numero di immagini inatteso."
            )
        results.extend(
            GenerationOutput(image=image, seed=request.seed, batch_index=index)
            for index, image in enumerate(images)
        )
    return results
