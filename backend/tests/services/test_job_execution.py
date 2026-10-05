from collections.abc import AsyncGenerator, AsyncIterator
from dataclasses import replace
from io import BytesIO
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi import FastAPI
from PIL import Image, ImageDraw

from app.config import Settings
from app.engine.fake_engine import FakeEngine
from app.engine.types import EngineEvent, EngineRequest, Failed, Generated, Interrupted
from app.errors import EngineExecutionError, EngineRejectedError
from app.main import create_app
from app.models.image_input import ImageInput
from app.models.job import JobParams, JobRequest, ResolvedJob
from app.services.job_execution import GenerationOutput, JobInterruptedError, execute_job
from app.services.job_resolution import resolve_job
from app.services.job_service import JobService

ORIGINAL_SIZE = (1280, 1280)


@pytest.fixture
async def job_service(tmp_path: Path) -> AsyncIterator[JobService]:
    config = Settings(engine_mode="fake", data_dir=tmp_path, styles_dir=tmp_path / "styles")
    application: FastAPI = create_app(config=config)
    async with application.router.lifespan_context(application):
        yield application.state.job_service


async def ignore_event(event: EngineEvent) -> None:
    pass


def build_inpaint_job(job_service: JobService, tmp_path: Path) -> ResolvedJob:
    original_path, mask_path = tmp_path / "original.png", tmp_path / "mask.png"
    original = Image.new(mode="RGB", size=ORIGINAL_SIZE, color=(10, 120, 30))
    draw = ImageDraw.Draw(im=original)
    for x in range(0, ORIGINAL_SIZE[0], 7):
        draw.line(xy=[(x, 0), (x, ORIGINAL_SIZE[1])], fill=(200, 200, 40), width=2)
    original.save(fp=original_path)
    mask = Image.new(mode="L", size=ORIGINAL_SIZE, color=0)
    ImageDraw.Draw(im=mask).rectangle(xy=(500, 500, 800, 800), fill=255)
    mask.save(fp=mask_path)
    request = JobRequest(
        task_id="inpaint", prompt="cat", input_upload_id=uuid4(), mask_upload_id=uuid4()
    )
    job = resolve_job(
        request=request,
        catalog=job_service.resources.catalog,
        styles=job_service.resources.styles,
        is_fake=True,
    )
    return replace(
        job, image_input=ImageInput(path=original_path, size=ORIGINAL_SIZE, mask_path=mask_path)
    )


async def test_execute_job_native_batch_returns_pngs_with_seed_and_indices(
    job_service: JobService,
) -> None:
    job = job_service._resolve(
        request=JobRequest(task_id="bozza", prompt="cat", params=JobParams(batch=2, seed=42))
    )

    outputs = await execute_job(
        job=job,
        engine=FakeEngine(step_delay_s=0),
        template=job_service.resources.templates[job.task.workflow],
        on_event=ignore_event,
    )

    assert len(outputs) == 2
    assert [(output.seed, output.batch_index) for output in outputs] == [(42, 0), (42, 1)]
    for output in outputs:
        assert isinstance(output, GenerationOutput)
        assert isinstance(output.image, bytes)
        with Image.open(fp=BytesIO(output.image)) as image:
            image.load()
            assert image.format == "PNG"
            assert image.size == (job.params.width, job.params.height)


async def test_execute_job_inpaint_restores_original_resolution(
    job_service: JobService, tmp_path: Path
) -> None:
    job = build_inpaint_job(job_service=job_service, tmp_path=tmp_path)
    generated_sizes: list[tuple[int, int]] = []

    async def record_generated_size(event: EngineEvent) -> None:
        if isinstance(event, Generated):
            with Image.open(fp=BytesIO(event.images[0])) as image:
                generated_sizes.append(image.size)

    outputs = await execute_job(
        job=job,
        engine=FakeEngine(step_delay_s=0),
        template=job_service.resources.templates[job.task.workflow],
        on_event=record_generated_size,
    )

    assert generated_sizes == [(job.params.width, job.params.height)]
    assert all(
        width < ORIGINAL_SIZE[0] and height < ORIGINAL_SIZE[1] for width, height in generated_sizes
    )
    assert len(outputs) == 1
    with Image.open(fp=BytesIO(outputs[0].image)) as image:
        image.load()
        assert image.format == "PNG"
        assert image.size == ORIGINAL_SIZE


async def test_execute_job_failed_propagates_original_error(job_service: JobService) -> None:
    error = EngineRejectedError(message="Test engine rejected the request")

    class FailingEngine(FakeEngine):
        async def run(self, request: EngineRequest) -> AsyncGenerator[EngineEvent, None]:
            yield Failed(error=error)

    job = job_service._resolve(request=JobRequest(task_id="bozza", prompt="cat"))

    with pytest.raises(EngineRejectedError) as raised:
        await execute_job(
            job=job,
            engine=FailingEngine(step_delay_s=0),
            template=job_service.resources.templates[job.task.workflow],
            on_event=ignore_event,
        )

    assert raised.value is error


async def test_execute_job_interrupted_raises_job_interrupted_error(
    job_service: JobService,
) -> None:
    class InterruptedEngine(FakeEngine):
        async def run(self, request: EngineRequest) -> AsyncGenerator[EngineEvent, None]:
            yield Interrupted()

    job = job_service._resolve(request=JobRequest(task_id="bozza", prompt="cat"))

    with pytest.raises(JobInterruptedError):
        await execute_job(
            job=job,
            engine=InterruptedEngine(step_delay_s=0),
            template=job_service.resources.templates[job.task.workflow],
            on_event=ignore_event,
        )


async def test_execute_job_short_batch_raises_exact_execution_error(
    job_service: JobService,
) -> None:
    class ShortBatchEngine(FakeEngine):
        async def run(self, request: EngineRequest) -> AsyncGenerator[EngineEvent, None]:
            async for event in super().run(request=request):
                if isinstance(event, Generated):
                    yield Generated(images=event.images[:-1])
                else:
                    yield event

    job = job_service._resolve(
        request=JobRequest(task_id="bozza", prompt="cat", params=JobParams(batch=2))
    )

    with pytest.raises(EngineExecutionError) as raised:
        await execute_job(
            job=job,
            engine=ShortBatchEngine(step_delay_s=0),
            template=job_service.resources.templates[job.task.workflow],
            on_event=ignore_event,
        )

    assert raised.value.message == "Il motore ha restituito un numero di immagini inatteso."
