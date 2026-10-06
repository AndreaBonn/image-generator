from dataclasses import replace
from pathlib import Path
from uuid import UUID

from PIL import Image

from app.errors import NotFoundError, ValidationError
from app.models.image_input import ImageInput
from app.models.job import ResolvedJob
from app.models.task import Scalar
from app.repositories.file_paths import resolve_data_path
from app.repositories.generation_repository import GenerationRepository
from app.repositories.upload_repository import UploadRepository
from app.services.image_geometry import (
    FLUX_PIXEL_GRID,
    REFINEMENT_FACTOR,
    closest_resolution,
    outpaint_padding,
    upscale_scale,
    work_size,
)
from app.services.job_resolution import IMAGE_TASKS, field_error
from app.services.job_resources import JobResources

SOURCE_NOT_FOUND_MESSAGE = "Immagine di partenza non trovata."


def upload_path(
    upload_id: UUID, kind: str, resources: JobResources, *, field: str | None = None
) -> Path:
    repository = UploadRepository(database=resources.repository.database)
    resolved_field = (
        field if field is not None else ("input_upload_id" if kind == "image" else "mask_upload_id")
    )
    try:
        record = repository.get(upload_id=str(upload_id))
    except NotFoundError as error:
        raise field_error(field=resolved_field, message="Immagine caricata non trovata.") from error
    if record.kind != kind:
        raise field_error(
            field=resolved_field, message="Il tipo di immagine caricata non è corretto."
        )
    return resolve_data_path(root=resources.settings.data_dir, relative=record.path)


def generation_image_path(
    generation_id: str, resources: JobResources, *, field: str, message: str
) -> Path:
    repository = GenerationRepository(database=resources.repository.database)
    try:
        record = repository.get(generation_id=generation_id)
    except NotFoundError as error:
        raise ValidationError(
            message=message, details=[{"field": field, "message": message}]
        ) from error
    return resolve_data_path(root=resources.settings.data_dir, relative=record.image_path)


def resolve_source(job: ResolvedJob, resources: JobResources) -> ImageInput:
    request = job.request
    parent_id = str(request.source_generation_id) if request.source_generation_id else None
    if parent_id is not None:
        # No form field shows this id (it comes from the URL), so the UI needs the
        # top-level message as well as the field detail.
        path = generation_image_path(
            generation_id=parent_id,
            resources=resources,
            field="source_generation_id",
            message=SOURCE_NOT_FOUND_MESSAGE,
        )
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
    if job.task.id == "rimuovi_sfondo":
        return source.size, values
    if job.task.id == "modifica_libera":
        return work_size(size=source.size, pixel_grid=FLUX_PIXEL_GRID), values
    if job.task.id in {"upscale", "ingrandisci_rifinito"}:
        return enlarged_dimensions(job=job, source=source)
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


def enlarged_dimensions(
    job: ResolvedJob, source: ImageInput
) -> tuple[tuple[int, int], dict[str, Scalar]]:
    if job.task.id == "ingrandisci_rifinito":
        width, height = work_size(size=source.size)
        denoise = job.request.params.denoise
        values = {"denoise": denoise if denoise is not None else job.task.defaults["denoise"]}
        return (width * REFINEMENT_FACTOR, height * REFINEMENT_FACTOR), values
    factor = job.request.upscale_factor
    if factor is None:
        raise field_error(field="upscale_factor", message="Scegli il fattore 2 o 4.")
    scale = upscale_scale(size=source.size, factor=factor)
    return (source.size[0] * factor, source.size[1] * factor), {"scale": scale}


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
