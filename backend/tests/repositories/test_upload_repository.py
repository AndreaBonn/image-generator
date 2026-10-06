from datetime import timedelta
from pathlib import Path
from uuid import uuid4

import pytest

from app.errors import NotFoundError
from app.models.job import JobRequest
from app.models.records import UploadRecord, utc_now
from app.repositories.database import Database
from app.repositories.job_repository import JobRepository
from app.repositories.upload_repository import UploadRepository


def test_remove_deletes_existing_record_and_is_noop_when_already_gone(tmp_path: Path) -> None:
    db = Database(data_dir=tmp_path)
    db.migrate()
    repository = UploadRepository(database=db)
    record = UploadRecord(
        id="upload-1", kind="image", path="uploads/upload-1.png", width=4, height=4
    )
    repository.add(record=record)
    assert repository.get(upload_id="upload-1").id == "upload-1"

    repository.remove(upload_id="upload-1")
    with pytest.raises(NotFoundError):
        repository.get(upload_id="upload-1")

    repository.remove(upload_id="upload-1")  # record is already gone: no-op, no exception
    db.close()


def expire(database: Database, *record_ids: str) -> None:
    with database.sessions.begin() as session:
        for record_id in record_ids:
            stored = session.get(entity=UploadRecord, ident=record_id)
            assert stored is not None
            stored.created_at = utc_now() - timedelta(days=8)


def make_upload(repository: UploadRepository) -> UploadRecord:
    upload_id = str(uuid4())
    record = UploadRecord(
        id=upload_id, kind="image", path=f"uploads/{upload_id}.png", width=4, height=4
    )
    repository.add(record=record)
    return record


def test_expired_excludes_upload_referenced_only_inside_references_list(tmp_path: Path) -> None:
    db = Database(data_dir=tmp_path)
    db.migrate()
    repository = UploadRepository(database=db)
    referenced = make_upload(repository=repository)
    unreferenced = make_upload(repository=repository)
    JobRepository(database=db).create(
        request=JobRequest(
            task_id="crea_da_riferimenti",
            prompt="cat",
            references=[{"upload_id": referenced.id}],
        ).model_dump(mode="json"),
        idempotency_key=None,
    )
    expire(db, referenced.id, unreferenced.id)

    expired_ids = {record.id for record in repository.expired(before=utc_now())}

    assert referenced.id not in expired_ids
    assert unreferenced.id in expired_ids
    db.close()


def test_expired_distinguishes_reference_sets_across_distinct_jobs(tmp_path: Path) -> None:
    db = Database(data_dir=tmp_path)
    db.migrate()
    repository = UploadRepository(database=db)
    uploads = [make_upload(repository=repository) for _ in range(4)]
    jobs = JobRepository(database=db)
    jobs.create(
        request=JobRequest(
            task_id="crea_da_riferimenti", prompt="cat", references=[{"upload_id": uploads[0].id}]
        ).model_dump(mode="json"),
        idempotency_key=None,
    )
    jobs.create(
        request=JobRequest(
            task_id="crea_da_riferimenti",
            prompt="cat",
            references=[{"upload_id": uploads[1].id}, {"upload_id": uploads[2].id}],
        ).model_dump(mode="json"),
        idempotency_key=None,
    )
    expire(db, *(upload.id for upload in uploads))

    expired_ids = {record.id for record in repository.expired(before=utc_now())}

    assert expired_ids == {uploads[3].id}
    db.close()
