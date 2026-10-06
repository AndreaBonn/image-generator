from dataclasses import replace

from PIL import Image

from app.models.image_input import ImageInput
from app.models.job import JobRequest, ReferenceInput, ResolvedJob
from app.services.job_inputs import generation_image_path, upload_path
from app.services.job_resources import JobResources

REFERENCE_FIELD = "references"
REFERENCE_NOT_FOUND_MESSAGE = "Immagine di riferimento non trovata."


def resolve_references(request: JobRequest, resources: JobResources) -> list[ImageInput]:
    """Resolve each entry of `request.references` into an `ImageInput`, preserving order.

    Each returned item carries its own `parent_id` (set when it comes from a generation),
    so the caller can derive the job-level parent as the first non-None one in the list.
    """
    return [
        resolve_reference(reference=reference, resources=resources)
        for reference in request.references or []
    ]


def resolve_reference(reference: ReferenceInput, resources: JobResources) -> ImageInput:
    if reference.upload_id is not None:
        parent_id = None
        path = upload_path(
            upload_id=reference.upload_id,
            kind="image",
            resources=resources,
            field=REFERENCE_FIELD,
        )
    else:
        # ReferenceInput guarantees exactly one of the two ids.
        parent_id = str(reference.generation_id)
        path = generation_image_path(
            generation_id=parent_id,
            resources=resources,
            field=REFERENCE_FIELD,
            message=REFERENCE_NOT_FOUND_MESSAGE,
        )
    with Image.open(fp=path) as source:
        size = source.size
    return ImageInput(path=path, size=size, parent_id=parent_id)


def resolve_reference_job(job: ResolvedJob, resources: JobResources) -> ResolvedJob:
    """Resolve `job.request.references` into `job.reference_inputs`, a no-op otherwise."""
    if job.task.workflow_by_reference_count is None:
        return job
    references = resolve_references(request=job.request, resources=resources)
    return replace(job, reference_inputs=references)
