from pathlib import Path

import pytest

from app.config import Settings
from app.errors import ValidationError
from app.models.image_input import ImageInput
from app.models.job import JobRequest, ResolvedJob, ResolvedParams
from app.repositories.database import Database
from app.repositories.image_repository import ImageRepository
from app.repositories.job_repository import JobRepository
from app.services.job_inputs import image_dimensions, resolve_source
from app.services.job_resources import JobResources
from app.services.style_service import StyleService
from app.services.task_catalog import TaskCatalog, load_catalog

PLACEHOLDER_PARAMS = ResolvedParams(
    aspect_ratio="", width=1, height=1, seed=0, batch=1, steps=0, cfg=0, style_ids=[]
)


def build_resources(tmp_path: Path, catalog: TaskCatalog) -> JobResources:
    settings = Settings(data_dir=tmp_path, engine_mode="fake", fooocus_dir=tmp_path / "fooocus")
    database = Database(data_dir=tmp_path)
    database.migrate()
    return JobResources(
        settings=settings,
        catalog=catalog,
        styles=StyleService(styles=()),
        repository=JobRepository(database=database),
        images=ImageRepository(data_dir=tmp_path),
        templates={},
    )


def minimal_job(task_id: str, request: JobRequest, catalog: TaskCatalog) -> ResolvedJob:
    task = next(task for task in catalog.tasks if task.id == task_id)
    return ResolvedJob(
        request=request, task=task, params=PLACEHOLDER_PARAMS, prompt_final="cat", negative_final=""
    )


def test_resolve_source_without_upload_or_generation_rejects(tmp_path: Path) -> None:
    catalog = load_catalog(settings=Settings(engine_mode="fake"))
    resources = build_resources(tmp_path=tmp_path, catalog=catalog)
    job = minimal_job(
        task_id="inpaint", request=JobRequest(task_id="inpaint", prompt="cat"), catalog=catalog
    )
    with pytest.raises(ValidationError) as error:
        resolve_source(job=job, resources=resources)
    assert error.value.details[0]["field"] == "input_upload_id"
    resources.repository.database.close()


def test_image_dimensions_upscale_without_factor_rejects(tmp_path: Path) -> None:
    catalog = load_catalog(settings=Settings(engine_mode="fake"))
    job = minimal_job(task_id="upscale", request=JobRequest(task_id="upscale"), catalog=catalog)
    source = ImageInput(path=Path("unused.png"), size=(100, 100))
    with pytest.raises(ValidationError) as error:
        image_dimensions(job=job, source=source)
    assert error.value.details[0]["field"] == "upscale_factor"


def test_image_dimensions_upscale_with_factor_scales_size(tmp_path: Path) -> None:
    catalog = load_catalog(settings=Settings(engine_mode="fake"))
    job = minimal_job(
        task_id="upscale",
        request=JobRequest(task_id="upscale", upscale_factor=2),
        catalog=catalog,
    )
    source = ImageInput(path=Path("unused.png"), size=(100, 50))
    size, values = image_dimensions(job=job, source=source)
    assert size == (200, 100)
    assert values["scale"] == pytest.approx(0.5)
