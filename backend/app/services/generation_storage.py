from dataclasses import dataclass
from time import monotonic
from typing import Any

from app.errors import JobTimeoutError
from app.models.job import ResolvedJob
from app.models.records import GenerationRecord
from app.repositories.image_repository import ImageRepository, SavedImage
from app.repositories.job_repository import JobRepository
from app.services.job_execution import GenerationOutput


@dataclass(frozen=True, kw_only=True)
class GenerationBatch:
    job_id: str
    job: ResolvedJob
    outputs: list[GenerationOutput]
    duration_ms: int
    deadline: float


def generation_metadata(batch: GenerationBatch, output: GenerationOutput) -> dict[str, Any]:
    job = batch.job
    params = {
        **job.params.model_dump(),
        **job.binding_values,
        "seed": output.seed,
        "batch_index": output.batch_index,
        "negative_prompt_final": job.negative_final,
    }
    return {
        "job_id": batch.job_id,
        "task_id": job.task.id,
        "model_ids": job.task.model_ids,
        "prompt": job.request.prompt,
        "negative_prompt": job.request.negative_prompt,
        "prompt_final": job.prompt_final,
        "params": params,
        "seed": output.seed,
        "duration_ms": batch.duration_ms,
        "parent_id": job.image_input.parent_id if job.image_input else None,
    }


def save_generations(
    batch: GenerationBatch, images: ImageRepository, repository: JobRepository
) -> list[str]:
    saved_images: list[SavedImage] = []
    records: list[GenerationRecord] = []
    try:
        for output in batch.outputs:
            check_deadline(deadline=batch.deadline)
            metadata = generation_metadata(batch=batch, output=output)
            saved = images.save(image=output.image, metadata=metadata)
            saved_images.append(saved)
            records.append(
                GenerationRecord(
                    **metadata,
                    id=saved.id,
                    image_path=saved.image_path,
                    thumb_path=saved.thumb_path,
                    width=saved.width,
                    height=saved.height,
                )
            )
        check_deadline(deadline=batch.deadline)
        repository.complete(job_id=batch.job_id, generations=records, deadline=batch.deadline)
    except Exception:
        # Compensate filesystem writes when a later image or the DB transaction fails.
        for saved in saved_images:
            images.remove(saved=saved)
        raise
    return [record.id for record in records]


def check_deadline(deadline: float) -> None:
    if monotonic() >= deadline:
        raise JobTimeoutError()
