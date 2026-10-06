from datetime import datetime

from sqlalchemy import exists, func, select, true

from app.errors import NotFoundError
from app.models.records import JobRecord, UploadRecord
from app.repositories.database import Database


class UploadRepository:
    def __init__(self, database: Database) -> None:
        self.database = database

    def add(self, record: UploadRecord) -> None:
        with self.database.sessions.begin() as session:
            session.add(instance=record)

    def get(self, upload_id: str) -> UploadRecord:
        with self.database.sessions() as session:
            record = session.get(entity=UploadRecord, ident=upload_id)
            if record is None:
                raise NotFoundError(message="Immagine caricata non trovata.")
            return record

    def expired(self, before: datetime) -> list[UploadRecord]:
        referenced_fields = (
            JobRecord.request["input_upload_id"].as_string() == UploadRecord.id
        ) | (JobRecord.request["mask_upload_id"].as_string() == UploadRecord.id)
        # `references` is a JSON array (crea_da_riferimenti); json_each unpacks each
        # element so its own upload_id can be compared, same as the two fields above.
        reference_each = func.json_each(JobRecord.request, "$.references").table_valued("value")
        referenced_in_list = (
            select(1)
            .select_from(JobRecord.__table__.join(reference_each, true()))
            .where(func.json_extract(reference_each.c.value, "$.upload_id") == UploadRecord.id)
            .exists()
        )
        referenced = exists().where(referenced_fields) | referenced_in_list
        with self.database.sessions() as session:
            return list(
                session.scalars(
                    select(UploadRecord).where(
                        UploadRecord.created_at < before,
                        ~referenced,
                    )
                )
            )

    def remove(self, upload_id: str) -> None:
        with self.database.sessions.begin() as session:
            record = session.get(entity=UploadRecord, ident=upload_id)
            if record is not None:
                session.delete(instance=record)
