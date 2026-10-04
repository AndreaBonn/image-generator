from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, ForeignKey, Index
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utc_now() -> datetime:
    return datetime.now(tz=UTC).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


class JobRecord(Base):
    __tablename__ = "jobs"
    __table_args__ = (
        Index("idx_jobs_status", "status"),
        Index("idx_jobs_created_at", "created_at"),
        Index("idx_jobs_idempotency_key", "idempotency_key", unique=True),
    )
    id: Mapped[str] = mapped_column(primary_key=True)
    task_id: Mapped[str]
    status: Mapped[str]
    comfy_prompt_id: Mapped[str | None]
    request: Mapped[dict[str, Any]] = mapped_column(JSON)
    error_code: Mapped[str | None]
    error_message: Mapped[str | None]
    idempotency_key: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)


class GenerationRecord(Base):
    __tablename__ = "generations"
    __table_args__ = tuple(
        Index(f"idx_generations_{column}", column)
        for column in ("created_at", "task_id", "parent_id", "job_id")
    )
    id: Mapped[str] = mapped_column(primary_key=True)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id"))
    task_id: Mapped[str]
    model_ids: Mapped[list[str]] = mapped_column(JSON)
    prompt: Mapped[str]
    negative_prompt: Mapped[str]
    prompt_final: Mapped[str]
    params: Mapped[dict[str, Any]] = mapped_column(JSON)
    seed: Mapped[int]
    width: Mapped[int]
    height: Mapped[int]
    image_path: Mapped[str]
    thumb_path: Mapped[str]
    parent_id: Mapped[str | None] = mapped_column(ForeignKey("generations.id"))
    duration_ms: Mapped[int]
    favorite: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)
    deleted_at: Mapped[datetime | None]


class UploadRecord(Base):
    __tablename__ = "uploads"
    id: Mapped[str] = mapped_column(primary_key=True)
    kind: Mapped[str]
    path: Mapped[str]
    width: Mapped[int]
    height: Mapped[int]
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)
