from collections.abc import AsyncGenerator, AsyncIterator
from dataclasses import replace
from io import BytesIO
from pathlib import Path
from typing import Any
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
from app.models.records import UploadRecord
from app.repositories.upload_repository import UploadRepository
from app.services.image_geometry import FLUX_PIXEL_GRID, work_size
from app.services.image_preparation import upload_reference_images
from app.services.job_execution import (
    GenerationOutput,
    JobInterruptedError,
    build_requests,
    execute_job,
)
from app.services.job_resolution import resolve_job
from app.services.job_service import JobService
from app.services.task_catalog import template_name_for

ORIGINAL_SIZE = (1280, 1280)


@pytest.fixture
async def job_service(tmp_path: Path) -> AsyncIterator[JobService]:
    config = Settings(engine_mode="fake", data_dir=tmp_path, styles_dir=tmp_path / "styles")
    application: FastAPI = create_app(config=config)
    async with application.router.lifespan_context(application):
        yield application.state.job_service


def single_template(job_service: JobService, job: ResolvedJob) -> dict[str, dict[str, Any]]:
    assert job.task.workflow is not None, "these tasks use a single workflow template"
    return job_service.resources.templates[job.task.workflow]


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


def build_reference_upload(data_dir: Path, size: tuple[int, int]) -> UploadRecord:
    upload_id = str(uuid4())
    relative = f"uploads/{upload_id}.png"
    path = data_dir / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new(mode="RGB", size=size, color=(10, 20, 30)).save(fp=path)
    return UploadRecord(id=upload_id, kind="image", path=relative, width=size[0], height=size[1])


@pytest.mark.parametrize("reference_count", [2, 3])
async def test_execute_job_reference_task_uploads_and_binds_each_reference(
    job_service: JobService, tmp_path: Path, reference_count: int
) -> None:
    sizes = [(640, 480), (300, 900), (1024, 1024)][:reference_count]
    repository = UploadRepository(database=job_service.resources.repository.database)
    uploads = [build_reference_upload(data_dir=tmp_path, size=size) for size in sizes]
    for record in uploads:
        repository.add(record=record)

    job = job_service._resolve(
        request=JobRequest(
            task_id="crea_da_riferimenti",
            prompt="cat",
            references=[{"upload_id": upload.id} for upload in uploads],
        )
    )
    assert job.reference_inputs is not None
    assert len(job.reference_inputs) == reference_count

    filename = template_name_for(task=job.task, reference_count=reference_count)
    assert filename == f"flux2_klein_refs_{reference_count}.json"

    engine = FakeEngine(step_delay_s=0)
    uploaded_job = await upload_reference_images(job=job, engine=engine)
    assert len(engine.uploaded_images) == reference_count

    template = job_service.resources.templates[filename]
    [request] = build_requests(job=uploaded_job, template=template)
    titles = {node["_meta"]["title"]: node for node in request.graph.values() if "_meta" in node}
    uploaded_names = list(engine.uploaded_images.keys())
    for index, size in enumerate(sizes, start=1):
        assert titles[f"@input_image_{index}"]["inputs"]["image"] == uploaded_names[index - 1]
        expected = work_size(size=size, pixel_grid=FLUX_PIXEL_GRID)
        resize_inputs = titles[f"@resize_{index}"]["inputs"]
        assert (resize_inputs["width"], resize_inputs["height"]) == expected


async def test_execute_job_native_batch_returns_pngs_with_seed_and_indices(
    job_service: JobService,
) -> None:
    job = job_service._resolve(
        request=JobRequest(task_id="bozza", prompt="cat", params=JobParams(batch=2, seed=42))
    )

    outputs = await execute_job(
        job=job,
        engine=FakeEngine(step_delay_s=0),
        template=single_template(job_service=job_service, job=job),
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
        template=single_template(job_service=job_service, job=job),
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
            template=single_template(job_service=job_service, job=job),
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
            template=single_template(job_service=job_service, job=job),
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
            template=single_template(job_service=job_service, job=job),
            on_event=ignore_event,
        )

    assert raised.value.message == "Il motore ha restituito un numero di immagini inatteso."
