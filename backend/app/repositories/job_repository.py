from datetime import timedelta
from time import monotonic
from typing import Any
from uuid import uuid4

from sqlalchemy import func, select, text, update
from sqlalchemy.orm import Session

from app.errors import AppError, EngineRestartedError, JobTimeoutError, NotFoundError
from app.models.records import GenerationRecord, JobRecord, utc_now
from app.repositories.database import Database

IDEMPOTENCY_WINDOW_S = 60
TERMINAL_STATUSES = frozenset({"completed", "failed", "cancelled"})


class IdempotencyConflictError(AppError):
    code = "IDEMPOTENCY_CONFLICT"
    http_status = 409
    default_message = "Questa chiave è già stata usata per una richiesta diversa."


class JobRepository:
    def __init__(self, database: Database) -> None:
        self.database = database

    def create(
        self, request: dict[str, Any], idempotency_key: str | None
    ) -> tuple[JobRecord, bool]:
        with self.database.sessions.begin() as session:
            session.execute(text("BEGIN IMMEDIATE"))
            existing = self._find_idempotent(session=session, key=idempotency_key, request=request)
            if existing is not None:
                return existing, False
            job = JobRecord(
                id=str(uuid4()),
                task_id=request["task_id"],
                status="queued",
                request=request,
                idempotency_key=idempotency_key,
            )
            session.add(instance=job)
        return job, True

    def _find_idempotent(
        self, session: Session, key: str | None, request: dict[str, Any]
    ) -> JobRecord | None:
        if key is None:
            return None
        job = session.scalar(select(JobRecord).where(JobRecord.idempotency_key == key))
        if job is None:
            return None
        if job.created_at <= utc_now() - timedelta(seconds=IDEMPOTENCY_WINDOW_S):
            job.idempotency_key = None
            session.flush()
            return None
        if job.request != request:
            raise IdempotencyConflictError()
        return job

    def get(self, job_id: str) -> JobRecord:
        with self.database.sessions() as session:
            job = session.get(entity=JobRecord, ident=job_id)
            if job is None:
                raise NotFoundError(message="Generazione in coda non trovata.")
            return job

    def generation_ids(self, job_id: str) -> list[str]:
        with self.database.sessions() as session:
            return list(
                session.scalars(
                    select(GenerationRecord.id)
                    .where(GenerationRecord.job_id == job_id)
                    .order_by(GenerationRecord.created_at, GenerationRecord.id)
                )
            )

    def set_prompt(self, job_id: str, prompt_id: str) -> None:
        self._update(job_id=job_id, values={"comfy_prompt_id": prompt_id})

    def queue_position(self, job_id: str) -> int:
        with self.database.sessions() as session:
            created_at = (
                select(JobRecord.created_at).where(JobRecord.id == job_id).scalar_subquery()
            )
            position = session.scalar(
                select(func.count())
                .select_from(JobRecord)
                .where(
                    JobRecord.status.in_(("queued", "running")), JobRecord.created_at < created_at
                )
            )
            return int(position or 0)

    def set_running(self, job_id: str) -> None:
        self._update(job_id=job_id, values={"status": "running"})

    def finish(self, job_id: str, status: str, error: AppError | None = None) -> None:
        self._update(
            job_id=job_id,
            values={
                "status": status,
                "error_code": error.code if error else None,
                "error_message": error.message if error else None,
            },
        )

    def _update(self, job_id: str, values: dict[str, Any]) -> None:
        with self.database.sessions.begin() as session:
            session.execute(
                update(JobRecord)
                .where(JobRecord.id == job_id, JobRecord.status.not_in(TERMINAL_STATUSES))
                .values(**values, updated_at=utc_now())
            )

    def reconcile(self) -> None:
        error = EngineRestartedError()
        with self.database.sessions.begin() as session:
            session.execute(
                update(JobRecord)
                .where(JobRecord.status.in_(("queued", "running")))
                .values(
                    status="failed",
                    error_code=error.code,
                    error_message=error.message,
                    updated_at=utc_now(),
                )
            )

    def complete(self, job_id: str, generations: list[GenerationRecord], deadline: float) -> None:
        with self.database.sessions.begin() as session:
            session.execute(text("BEGIN IMMEDIATE"))
            if monotonic() >= deadline:
                raise JobTimeoutError()
            job = session.get(entity=JobRecord, ident=job_id)
            if job is None or job.status in TERMINAL_STATUSES:
                raise RuntimeError("Cannot complete a terminal or missing job")
            session.add_all(instances=generations)
            job.status = "completed"
            session.flush()
            if monotonic() >= deadline:
                raise JobTimeoutError()
