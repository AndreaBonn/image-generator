from pathlib import Path
from time import monotonic
from unittest.mock import patch

import pytest

from app.config import Settings
from app.engine.fake_engine import render_image
from app.models.job import JobRequest
from app.repositories.database import Database
from app.repositories.image_repository import ImageRepository, SavedImage
from app.repositories.job_repository import JobRepository
from app.services.generation_storage import GenerationBatch, save_generations
from app.services.job_execution import GenerationOutput
from app.services.job_resolution import resolve_job
from app.services.style_service import StyleService
from app.services.task_catalog import load_catalog


def test_save_generations_compensates_earlier_images_when_a_later_save_fails(
    tmp_path: Path,
) -> None:
    database = Database(data_dir=tmp_path)
    database.migrate()
    job_repository = JobRepository(database=database)
    job_record, _ = job_repository.create(
        request={"task_id": "bozza", "prompt": "cat"}, idempotency_key=None
    )
    job_repository.set_running(job_id=job_record.id)

    job = resolve_job(
        request=JobRequest(task_id="bozza", prompt="cat"),
        catalog=load_catalog(settings=Settings(engine_mode="fake")),
        styles=StyleService(styles=()),
        is_fake=True,
    )
    outputs = [
        GenerationOutput(
            image=render_image(width=16, height=16, seed=index), seed=index, batch_index=0
        )
        for index in range(4)
    ]
    batch = GenerationBatch(
        job_id=job_record.id, job=job, outputs=outputs, duration_ms=5, deadline=monotonic() + 30
    )

    images = ImageRepository(data_dir=tmp_path)
    saved_so_far: list[SavedImage] = []
    original_save = images.save

    def fail_on_third_image(image: bytes, metadata: dict[str, object]) -> SavedImage:
        # The 3rd call fails before writing anything (mirrors ImageRepository.save, which
        # cleans up its own partial write before raising): no orphaned file is left behind.
        if len(saved_so_far) == 2:
            raise RuntimeError("engine died while writing the 3rd image")
        saved = original_save(image=image, metadata=metadata)
        saved_so_far.append(saved)
        return saved

    with patch.object(images, "save", side_effect=fail_on_third_image):
        with pytest.raises(RuntimeError):
            save_generations(batch=batch, images=images, repository=job_repository)

    assert len(saved_so_far) == 2
    for saved in saved_so_far:
        assert not (tmp_path / saved.image_path).exists()
        assert not (tmp_path / saved.thumb_path).exists()
    # the job was never marked complete: the DB transaction never ran.
    assert job_repository.get(job_id=job_record.id).status == "running"
    database.close()
