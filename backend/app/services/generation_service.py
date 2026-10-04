import logging
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from app.errors import NotFoundError
from app.models.generation import GalleryQuery, GenerationSummary, RerunJobRequest
from app.models.job import JobRequest
from app.models.records import GenerationRecord
from app.repositories.file_paths import resolve_data_path
from app.repositories.generation_repository import GenerationRepository
from app.repositories.job_repository import JobRepository

logger = logging.getLogger(__name__)


def generation_file_bytes(path: Path, remove: bool = False) -> int:
    try:
        size = path.stat().st_size
        if remove:
            path.unlink()
        return size
    except FileNotFoundError:
        return 0


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
        record = self.repository.get(generation_id=generation_id, include_trashed=True)
        return resolve_data_path(
            root=self.data_dir, relative=record.thumb_path if thumbnail else record.image_path
        )

    def favorite(self, generation_id: str, favorite: bool) -> dict[str, Any]:
        record = self.repository.update(generation_id=generation_id, favorite=favorite)
        return generation_detail(record=record)

    def delete(self, generation_id: str) -> None:
        self.repository.update(generation_id=generation_id)

    def restore(self, generation_id: str) -> dict[str, Any]:
        return generation_detail(record=self.repository.restore(generation_id=generation_id))

    def trash_summary(self) -> dict[str, int]:
        records = self.repository.trashed()
        return {"count": len(records), "bytes": self._trash_bytes(records=records)}

    def empty_trash(self) -> dict[str, int]:
        # Commit DB deletion first so a crash can only leave orphaned files, never broken rows.
        records = self.repository.purge()
        return {
            "purged": len(records),
            "freed_bytes": self._trash_bytes(records=records, remove=True),
        }

    def _trash_bytes(self, records: Sequence[GenerationRecord], remove: bool = False) -> int:
        total = 0
        for record in records:
            for relative in (record.image_path, record.thumb_path):
                try:
                    path = resolve_data_path(
                        root=self.data_dir, relative=relative, must_exist=False
                    )
                except NotFoundError:
                    logger.warning("Skipping unsafe generation path during purge: id=%s", record.id)
                    continue
                total += generation_file_bytes(path=path, remove=remove)
        return total

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
