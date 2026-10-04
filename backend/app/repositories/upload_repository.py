from datetime import datetime

from sqlalchemy import exists, select

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
        referenced = exists().where(
            (JobRecord.request["input_upload_id"].as_string() == UploadRecord.id)
            | (JobRecord.request["mask_upload_id"].as_string() == UploadRecord.id)
        )
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
