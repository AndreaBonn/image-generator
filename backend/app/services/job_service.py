import asyncio
import logging
from typing import Any

from app.async_tasks import drain_task
from app.engine.types import EngineClient
from app.models.job import JobRequest, ResolvedJob
from app.repositories.job_repository import TERMINAL_STATUSES
from app.services.job_events import JobEvents
from app.services.job_inputs import resolve_image_job
from app.services.job_references import resolve_reference_job
from app.services.job_resolution import resolve_job
from app.services.job_resources import JobResources
from app.services.job_run import JobRun
from app.services.job_runner import JobRunner

logger = logging.getLogger(__name__)


class JobService:
    def __init__(self, resources: JobResources) -> None:
        self.resources = resources
        self.repository = resources.repository
        self.events = JobEvents(repository=self.repository)
        self.runner = JobRunner(resources=resources, events=self.events)
        self.runs: dict[str, JobRun] = {}

    async def submit(
        self, request: JobRequest, engine: EngineClient, idempotency_key: str | None = None
    ) -> str:
        submission = asyncio.create_task(
            coro=self._submit(request=request, engine=engine, idempotency_key=idempotency_key)
        )
        try:
            return await asyncio.shield(arg=submission)
        except asyncio.CancelledError as cancellation:
            try:
                await drain_task(task=submission)
            except Exception:
                logger.exception("Job submission failed after caller disconnected")
            raise cancellation

    async def _submit(
        self, request: JobRequest, engine: EngineClient, idempotency_key: str | None
    ) -> str:
        resolved = await asyncio.to_thread(
            self._resolve,
            request=request,
        )
        record, created = await asyncio.to_thread(
            self.repository.create,
            request=request.model_dump(mode="json"),
            idempotency_key=idempotency_key,
        )
        if created:
            run = JobRun(id=record.id, job=resolved, engine=engine)
            self.runs[run.id] = run
            run.task = asyncio.create_task(coro=self._run(run=run), name=f"job-{run.id}")
        return record.id

    def _resolve(self, request: JobRequest) -> ResolvedJob:
        job = resolve_job(
            request=request,
            catalog=self.resources.catalog,
            styles=self.resources.styles,
            is_fake=self.resources.settings.engine_mode == "fake",
        )
        job = resolve_image_job(job=job, resources=self.resources)
        return resolve_reference_job(job=job, resources=self.resources)

    async def _run(self, run: JobRun) -> None:
        try:
            await self.runner.run(run=run)
        finally:
            self.runs.pop(run.id, None)

    async def status(self, job_id: str) -> dict[str, Any]:
        record = await asyncio.to_thread(self.repository.get, job_id=job_id)
        ids = await asyncio.to_thread(self.repository.generation_ids, job_id=job_id)
        return {
            "job_id": record.id,
            "task_id": record.task_id,
            "status": record.status,
            "generation_ids": ids,
            "error_code": record.error_code,
            "error_message": record.error_message,
            "request": record.request,
            "created_at": record.created_at.isoformat(),
            "updated_at": record.updated_at.isoformat(),
        }

    async def active(self) -> list[dict[str, str]]:
        """Jobs this process is running now (N1), read from memory so a job left
        'running' in the database by a crashed process is never reported."""
        records = await asyncio.gather(
            *(asyncio.to_thread(self.repository.get, job_id=job_id) for job_id in list(self.runs))
        )
        return [
            {"job_id": record.id, "task_id": record.task_id, "status": record.status}
            for record in records
            if record.status not in TERMINAL_STATUSES
        ]

    async def cancel(self, job_id: str) -> dict[str, Any]:
        await asyncio.to_thread(self.repository.get, job_id=job_id)
        run = self.runs.get(job_id)
        if run is not None:
            async with run.completion_lock:
                if not run.is_saving and run.task is not None and not run.is_cancelled:
                    run.is_cancelled = True
                    run.task.cancel()
            await self._await_cancellation(run=run)
        return await self.status(job_id=job_id)

    async def _await_cancellation(self, run: JobRun) -> None:
        if run.task is not None:
            try:
                await asyncio.shield(arg=run.task)
            except asyncio.CancelledError:
                if not run.task.cancelled():
                    raise
        if (await self.status(job_id=run.id))["status"] not in TERMINAL_STATUSES:
            await self.runner.finish(run=run, status="cancelled")
        self.runs.pop(run.id, None)

    async def close(self) -> None:
        await asyncio.gather(*(self.cancel(job_id=job_id) for job_id in list(self.runs)))
