from datetime import timedelta
from io import BytesIO
from pathlib import Path
from typing import Literal

import pytest
from PIL import Image

from app.config import Settings
from app.lifespan import initialize_resources
from app.models.job import JobRequest
from app.models.records import UploadRecord, utc_now
from app.repositories.database import Database
from app.repositories.job_repository import JobRepository
from app.repositories.upload_repository import UploadRepository
from app.services.upload_service import UploadService


def create_upload(service: UploadService, kind: Literal["image", "mask"] = "image") -> UploadRecord:
    stream = BytesIO()
    Image.new(mode="RGB", size=(16, 16)).save(fp=stream, format="PNG")
    return service.save(content=stream, kind=kind)


def test_startup_cleanup_preserves_job_references_and_recent_uploads(tmp_path: Path) -> None:
    database = Database(data_dir=tmp_path)
    database.migrate()
    service = UploadService(repository=UploadRepository(database=database), data_dir=tmp_path)
    image, mask, expired, recent = [create_upload(service=service) for _ in range(4)]
    job = JobRequest(
        task_id="inpaint", prompt="cat", input_upload_id=image.id, mask_upload_id=mask.id
    )
    JobRepository(database=database).create(
        request=job.model_dump(mode="json"), idempotency_key=None
    )
    with database.sessions.begin() as session:
        for record in (image, mask, expired):
            stored = session.get(entity=UploadRecord, ident=record.id)
            assert stored is not None
            stored.created_at = utc_now() - timedelta(days=8)
    database.close()
    resources = initialize_resources(
        config=Settings(data_dir=tmp_path, engine_mode="fake", fooocus_dir=tmp_path / "fooocus")
    )
    with resources.repository.database.sessions() as session:
        assert session.get(entity=UploadRecord, ident=expired.id) is None
        for record in (image, mask, recent):
            assert session.get(entity=UploadRecord, ident=record.id) is not None
            assert (tmp_path / record.path).exists()
    assert not (tmp_path / expired.path).exists()
    resources.repository.database.close()


def test_cleanup_never_unlinks_external_symlink_target(tmp_path: Path) -> None:
    data_dir = tmp_path / "data"
    database = Database(data_dir=data_dir)
    database.migrate()
    service = UploadService(repository=UploadRepository(database=database), data_dir=data_dir)
    record = create_upload(service=service)
    with database.sessions.begin() as session:
        stored = session.get(entity=UploadRecord, ident=record.id)
        assert stored is not None
        stored.created_at = utc_now() - timedelta(days=8)
    path = data_dir / record.path
    path.unlink()
    outside = tmp_path / "outside.png"
    outside.write_bytes(data=b"protected")
    path.symlink_to(target=outside)
    service.cleanup()
    assert outside.read_bytes() == b"protected"
    assert path.is_symlink()
    database.close()


def test_upload_failed_transaction_removes_written_file(tmp_path: Path) -> None:
    database = Database(data_dir=tmp_path)
    service = UploadService(repository=UploadRepository(database=database), data_dir=tmp_path)
    from sqlalchemy.exc import OperationalError

    with pytest.raises(OperationalError):
        create_upload(service=service)
    assert list((tmp_path / "uploads").iterdir()) == []
    database.close()
