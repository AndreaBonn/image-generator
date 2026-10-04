from dataclasses import replace
from pathlib import Path
from uuid import UUID

from PIL import Image

from app.errors import NotFoundError
from app.models.image_input import ImageInput
from app.models.job import ResolvedJob
from app.models.task import Scalar
from app.repositories.file_paths import resolve_data_path
from app.repositories.generation_repository import GenerationRepository
from app.repositories.upload_repository import UploadRepository
from app.services.image_geometry import (
    closest_resolution,
    outpaint_padding,
    upscale_scale,
    work_size,
)
from app.services.job_resolution import IMAGE_TASKS, field_error
from app.services.job_resources import JobResources


def upload_path(upload_id: UUID, kind: str, resources: JobResources) -> Path:
    repository = UploadRepository(database=resources.repository.database)
    field = "input_upload_id" if kind == "image" else "mask_upload_id"
    try:
        record = repository.get(upload_id=str(upload_id))
    except NotFoundError as error:
        raise field_error(field=field, message="Immagine caricata non trovata.") from error
    if record.kind != kind:
        raise field_error(field=field, message="Il tipo di immagine caricata non è corretto.")
    return resolve_data_path(root=resources.settings.data_dir, relative=record.path)


def resolve_source(job: ResolvedJob, resources: JobResources) -> ImageInput:
    request = job.request
    parent_id = str(request.source_generation_id) if request.source_generation_id else None
    if parent_id is not None:
        repository = GenerationRepository(database=resources.repository.database)
        record = repository.get(generation_id=parent_id)
        path = resolve_data_path(root=resources.settings.data_dir, relative=record.image_path)
    elif request.input_upload_id is not None:
        path = upload_path(upload_id=request.input_upload_id, kind="image", resources=resources)
    else:
        raise field_error(field="input_upload_id", message="Scegli un'immagine di partenza.")
    mask_path = None
    if request.mask_upload_id is not None:
        mask_path = upload_path(upload_id=request.mask_upload_id, kind="mask", resources=resources)
    with Image.open(fp=path) as source:
        size = source.size
    return ImageInput(path=path, size=size, mask_path=mask_path, parent_id=parent_id)


def image_dimensions(
    job: ResolvedJob, source: ImageInput
) -> tuple[tuple[int, int], dict[str, Scalar]]:
    values: dict[str, Scalar] = {}
    if job.task.id == "upscale":
        factor = job.request.upscale_factor
        if factor is None:
            raise field_error(field="upscale_factor", message="Scegli il fattore 2 o 4.")
        values["scale"] = upscale_scale(size=source.size, factor=factor)
        return (source.size[0] * factor, source.size[1] * factor), values
    if job.task.id.startswith("variazione_"):
        ratio = closest_resolution(size=source.size, ratios=job.task.aspect_ratios)
        values["denoise"] = job.task.defaults["denoise"]
        return (ratio.width, ratio.height), values
    width, height = work_size(size=source.size)
    if job.task.id == "outpaint":
        padding = outpaint_padding(
            size=(width, height), directions=list(job.request.outpaint_directions)
        )
        values.update(padding)
        width += padding["pad_left"] + padding["pad_right"]
        height += padding["pad_top"] + padding["pad_bottom"]
    return (width, height), values


def resolve_image_job(job: ResolvedJob, resources: JobResources) -> ResolvedJob:
    if job.task.id not in IMAGE_TASKS:
        return job
    source = resolve_source(job=job, resources=resources)
    size, values = image_dimensions(job=job, source=source)
    params = job.params.model_copy(
        update={
            "width": size[0],
            "height": size[1],
            "aspect_ratio": f"{size[0]}*{size[1]}",
        }
    )
    return replace(job, params=params, image_input=source, binding_values=values)
