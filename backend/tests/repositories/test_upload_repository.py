from pathlib import Path

import pytest

from app.errors import NotFoundError
from app.models.records import UploadRecord
from app.repositories.database import Database
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
