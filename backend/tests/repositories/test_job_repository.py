from datetime import timedelta
from pathlib import Path
from time import monotonic

import pytest
from alembic import command
from sqlalchemy import inspect, select, text

from app.errors import AppError, JobTimeoutError
from app.models.records import JobRecord, utc_now
from app.repositories.database import Database
from app.repositories.job_repository import JobRepository


def test_migration_upgrade_downgrade_upgrade(tmp_path: Path) -> None:
    db = Database(data_dir=tmp_path)
    db.migrate()
    with db.engine.connect() as connection:
        assert connection.scalar(text("PRAGMA foreign_keys")) == 1
    assert set(inspect(db.engine).get_table_names()) == {
        "alembic_version",
        "generations",
        "jobs",
        "uploads",
    }
    indexes = inspect(db.engine).get_indexes("generations")
    assert "idx_generations_job_id" in {index["name"] for index in indexes}
    command.downgrade(config=db.alembic_config(), revision="base")
    assert inspect(db.engine).get_table_names() == ["alembic_version"]
    db.migrate()
    assert len(inspect(db.engine).get_columns("generations")) == 19
    db.close()


def test_repository_idempotency_conflict_expiry_and_restart(tmp_path: Path) -> None:
    db = Database(data_dir=tmp_path)
    db.migrate()
    repository = JobRepository(database=db)
    body = {"task_id": "bozza", "prompt": "cat"}
    first, created = repository.create(request=body, idempotency_key="k")
    second, reused = repository.create(request=body, idempotency_key="k")
    assert created and not reused and second.id == first.id
    with pytest.raises(AppError) as conflict:
        repository.create(request={**body, "prompt": "dog"}, idempotency_key="k")
    assert conflict.value.http_status == 409
    with db.sessions.begin() as session:
        record = session.get(JobRecord, first.id)
        assert record is not None
        record.created_at = utc_now() - timedelta(seconds=61)
    third, created = repository.create(request=body, idempotency_key="k")
    assert created and third.id != first.id
    repository.set_running(job_id=third.id)
    repository.reconcile()
    with db.sessions() as session:
        jobs = session.scalars(select(JobRecord)).all()
        assert [(job.status, job.error_code) for job in jobs] == [
            ("failed", "ENGINE_RESTARTED"),
            ("failed", "ENGINE_RESTARTED"),
        ]
    db.close()


def test_complete_rejects_missing_or_terminal_job(tmp_path: Path) -> None:
    db = Database(data_dir=tmp_path)
    db.migrate()
    repository = JobRepository(database=db)
    with pytest.raises(RuntimeError):
        repository.complete(job_id="missing", generations=[], deadline=monotonic() + 10)
    job, _ = repository.create(request={"task_id": "bozza", "prompt": "cat"}, idempotency_key=None)
    repository.set_running(job_id=job.id)
    repository.complete(job_id=job.id, generations=[], deadline=monotonic() + 10)
    assert repository.get(job_id=job.id).status == "completed"
    with pytest.raises(RuntimeError):
        repository.complete(job_id=job.id, generations=[], deadline=monotonic() + 10)
    db.close()


def test_complete_raises_timeout_when_deadline_already_passed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    db = Database(data_dir=tmp_path)
    db.migrate()
    repository = JobRepository(database=db)
    job, _ = repository.create(request={"task_id": "bozza", "prompt": "cat"}, idempotency_key=None)
    repository.set_running(job_id=job.id)
    monkeypatch.setattr("app.repositories.job_repository.monotonic", lambda: 100.0)
    with pytest.raises(JobTimeoutError):
        repository.complete(job_id=job.id, generations=[], deadline=50.0)
    assert repository.get(job_id=job.id).status == "running"
    db.close()


def test_complete_raises_timeout_when_deadline_passes_during_write(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    db = Database(data_dir=tmp_path)
    db.migrate()
    repository = JobRepository(database=db)
    job, _ = repository.create(request={"task_id": "bozza", "prompt": "cat"}, idempotency_key=None)
    repository.set_running(job_id=job.id)
    clock = iter([0.0, 100.0])
    monkeypatch.setattr("app.repositories.job_repository.monotonic", lambda: next(clock))
    with pytest.raises(JobTimeoutError):
        repository.complete(job_id=job.id, generations=[], deadline=50.0)
    # the transaction must roll back: the job is left exactly as before the call
    assert repository.get(job_id=job.id).status == "running"
    db.close()
