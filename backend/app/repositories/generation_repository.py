from sqlalchemy import func, select
from sqlalchemy.sql.elements import ColumnElement

from app.errors import NotFoundError
from app.models.generation import GalleryQuery
from app.models.records import GenerationRecord, utc_now
from app.repositories.database import Database


class GenerationRepository:
    def __init__(self, database: Database) -> None:
        self.database = database

    def get(self, generation_id: str) -> GenerationRecord:
        with self.database.sessions() as session:
            record = session.get(entity=GenerationRecord, ident=generation_id)
            if record is None or record.deleted_at is not None:
                raise NotFoundError()
            return record

    def list(self, query: GalleryQuery) -> tuple[list[GenerationRecord], int]:
        filters: list[ColumnElement[bool]] = [GenerationRecord.deleted_at.is_(None)]
        if query.task_id is not None:
            filters.append(GenerationRecord.task_id == query.task_id)
        if query.q is not None:
            filters.append(GenerationRecord.prompt.contains(query.q, autoescape=True))
        if query.favorite is not None:
            filters.append(GenerationRecord.favorite == query.favorite)
        with self.database.sessions() as session:
            total = session.scalar(
                select(func.count()).select_from(GenerationRecord).where(*filters)
            )
            rows = session.scalars(
                select(GenerationRecord)
                .where(*filters)
                .order_by(GenerationRecord.created_at.desc(), GenerationRecord.id.desc())
                .offset((query.page - 1) * query.per_page)
                .limit(query.per_page)
            )
            return list(rows), int(total or 0)

    def update(self, generation_id: str, favorite: bool | None = None) -> GenerationRecord:
        with self.database.sessions.begin() as session:
            record = session.get(entity=GenerationRecord, ident=generation_id)
            if record is None or record.deleted_at is not None:
                raise NotFoundError()
            if favorite is None:
                record.deleted_at = utc_now()
            else:
                record.favorite = favorite
            record.updated_at = utc_now()
        return record
