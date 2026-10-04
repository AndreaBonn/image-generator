from pathlib import Path
from typing import Any

from app.models.generation import GalleryQuery, GenerationSummary, RerunJobRequest
from app.models.job import JobRequest
from app.models.records import GenerationRecord
from app.repositories.file_paths import resolve_data_path
from app.repositories.generation_repository import GenerationRepository
from app.repositories.job_repository import JobRepository


def generation_detail(record: GenerationRecord) -> dict[str, Any]:
    data = GenerationSummary.model_validate(obj=record).model_dump(mode="json")
    fields = ("job_id", "model_ids", "negative_prompt", "prompt_final", "params", "duration_ms")
    return {
        **data,
        **{name: getattr(record, name) for name in fields},
        "updated_at": record.updated_at.isoformat(),
    }


class GenerationService:
    def __init__(
        self, repository: GenerationRepository, jobs: JobRepository, data_dir: Path
    ) -> None:
        self.repository = repository
        self.jobs = jobs
        self.data_dir = data_dir

    def list(self, query: GalleryQuery) -> dict[str, Any]:
        records, total = self.repository.list(query=query)
        data = [
            {
                **GenerationSummary.model_validate(obj=record).model_dump(mode="json"),
                "thumbnail_url": f"/api/v1/generations/{record.id}/thumbnail",
            }
            for record in records
        ]
        return {
            "data": data,
            "meta": {
                "page": query.page,
                "per_page": query.per_page,
                "total": total,
                "total_pages": (total + query.per_page - 1) // query.per_page,
            },
        }

    def detail(self, generation_id: str) -> dict[str, Any]:
        return generation_detail(record=self.repository.get(generation_id=generation_id))

    def file(self, generation_id: str, thumbnail: bool = False) -> Path:
        record = self.repository.get(generation_id=generation_id)
        return resolve_data_path(
            root=self.data_dir, relative=record.thumb_path if thumbnail else record.image_path
        )

    def favorite(self, generation_id: str, favorite: bool) -> dict[str, Any]:
        record = self.repository.update(generation_id=generation_id, favorite=favorite)
        return generation_detail(record=record)

    def delete(self, generation_id: str) -> None:
        self.repository.update(generation_id=generation_id)

    def rerun_request(self, generation_id: str, new_seed: bool) -> JobRequest:
        record = self.repository.get(generation_id=generation_id)
        original = self.jobs.get(job_id=record.job_id)
        request = RerunJobRequest.model_validate(
            obj={
                **original.request,
                "rerun_generation_id": generation_id,
            }
        )
        params = request.params.model_copy(update={"seed": None if new_seed else record.seed})
        return request.model_copy(update={"params": params})
