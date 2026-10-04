import builtins

from sqlalchemy import delete, func, select, text, update
from sqlalchemy.sql.elements import ColumnElement

from app.errors import NotFoundError
from app.models.generation import GalleryQuery
from app.models.records import GenerationRecord, utc_now
from app.repositories.database import Database


def gallery_filters(query: GalleryQuery) -> list[ColumnElement[bool]]:
    visibility = (
        GenerationRecord.deleted_at.is_not(None)
        if query.trashed
        else GenerationRecord.deleted_at.is_(None)
    )
    filters: list[ColumnElement[bool]] = [visibility]
    if query.task_id is not None:
        filters.append(GenerationRecord.task_id == query.task_id)
    if query.q is not None:
        filters.append(GenerationRecord.prompt.contains(query.q, autoescape=True))
    if query.favorite is not None:
        filters.append(GenerationRecord.favorite == query.favorite)
    return filters


class GenerationRepository:
    def __init__(self, database: Database) -> None:
        self.database = database

    def get(self, generation_id: str, include_trashed: bool = False) -> GenerationRecord:
        with self.database.sessions() as session:
            record = session.get(entity=GenerationRecord, ident=generation_id)
            if record is None or (record.deleted_at is not None and not include_trashed):
                raise NotFoundError()
            return record

    def list(self, query: GalleryQuery) -> tuple[list[GenerationRecord], int]:
        filters = gallery_filters(query=query)
        order = GenerationRecord.deleted_at if query.trashed else GenerationRecord.created_at
        with self.database.sessions() as session:
            total = session.scalar(
                select(func.count()).select_from(GenerationRecord).where(*filters)
            )
            rows = session.scalars(
                select(GenerationRecord)
                .where(*filters)
                .order_by(order.desc(), GenerationRecord.id.desc())
                .offset((query.page - 1) * query.per_page)
                .limit(query.per_page)
            )
            return list(rows), int(total or 0)

    def update(self, generation_id: str, favorite: bool | None = None) -> GenerationRecord:
        with self.database.sessions.begin() as session:
            session.execute(statement=text("BEGIN IMMEDIATE"))
            record = session.get(entity=GenerationRecord, ident=generation_id)
            if record is None or record.deleted_at is not None:
                raise NotFoundError()
            if favorite is None:
                record.deleted_at = utc_now()
            else:
                record.favorite = favorite
            record.updated_at = utc_now()
        return record

    def restore(self, generation_id: str) -> GenerationRecord:
        with self.database.sessions.begin() as session:
            session.execute(statement=text("BEGIN IMMEDIATE"))
            record = session.get(entity=GenerationRecord, ident=generation_id)
            if record is None or record.deleted_at is None:
                raise NotFoundError()
            record.deleted_at = None
            record.updated_at = utc_now()
        return record

    def trashed(self) -> builtins.list[GenerationRecord]:
        with self.database.sessions() as session:
            return list(
                session.scalars(
                    statement=select(GenerationRecord).where(
                        GenerationRecord.deleted_at.is_not(None)
                    )
                )
            )

    def purge(self) -> builtins.list[GenerationRecord]:
        with self.database.sessions.begin() as session:
            session.execute(statement=text("BEGIN IMMEDIATE"))
            trashed = GenerationRecord.deleted_at.is_not(None)
            records = list(session.scalars(statement=select(GenerationRecord).where(trashed)))
            targets = select(GenerationRecord.id).where(trashed)
            session.execute(
                statement=(
                    update(GenerationRecord)
                    .where(GenerationRecord.parent_id.in_(targets))
                    .values(parent_id=None, updated_at=utc_now())
                    .execution_options(synchronize_session=False)
                )
            )
            session.execute(
                statement=(
                    delete(GenerationRecord)
                    .where(trashed)
                    .execution_options(synchronize_session=False)
                )
            )
        return records
