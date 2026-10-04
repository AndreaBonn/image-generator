import asyncio
import logging
from time import monotonic

from app.async_tasks import drain_task
from app.engine.types import EngineEvent, Progress, Queued, Started
from app.errors import AppError, JobTimeoutError
from app.services.generation_storage import GenerationBatch, save_generations
from app.services.job_events import JobEvent, JobEvents
from app.services.job_execution import GenerationOutput, JobInterruptedError, execute_job
from app.services.job_resources import JobResources
from app.services.job_run import JobRun

logger = logging.getLogger(__name__)
MILLISECONDS_PER_SECOND = 1000


class JobRunner:
    def __init__(self, resources: JobResources, events: JobEvents) -> None:
        self.resources = resources
        self.repository = resources.repository
        self.events = events
        self.execution_lock = asyncio.Lock()
        self.family: str | None = None

    async def run(self, run: JobRun) -> None:
        started = monotonic()
        try:
            async with self.execution_lock:
                await self._guard_execution(run=run)
        except asyncio.CancelledError:
            await self.finish(run=run, status="cancelled")
        finally:
            logger.info(
                "Job finished: id=%s task=%s duration_ms=%s",
                run.id,
                run.job.task.id,
                int((monotonic() - started) * MILLISECONDS_PER_SECOND),
            )

    async def _guard_execution(self, run: JobRun) -> None:
        try:
            await self._execute(run=run)
        except asyncio.CancelledError:
            self.family = None
            await self._stop(run=run)
            await self.finish(run=run, status="cancelled")
        except JobInterruptedError:
            self.family = None
            await self.finish(run=run, status="cancelled")
        except AppError as error:
            self.family = None
            logger.error("Job failed: id=%s code=%s", run.id, error.code)
            await self.finish(run=run, status="failed", error=error)
        except Exception:
            self.family = None
            logger.exception("Unexpected job failure: id=%s", run.id)
            await self.finish(run=run, status="failed", error=AppError())

    async def _execute(self, run: JobRun) -> None:
        if run.is_cancelled:
            raise JobInterruptedError()
        started = monotonic()
        try:
            async with asyncio.timeout(delay=self.resources.settings.job_timeout_s):
                await self._switch_family(run=run)
                outputs = await execute_job(
                    job=run.job,
                    engine=run.engine,
                    template=self.resources.templates[run.job.task.workflow],
                    on_event=lambda event: self._on_event(run=run, event=event),
                )
                await self._save(run=run, outputs=outputs, started=started)
        except TimeoutError as error:
            await self._stop(run=run, timed_out=True)
            raise JobTimeoutError() from error
        except JobTimeoutError:
            await self._stop(run=run, timed_out=True)
            raise

    async def _save(self, run: JobRun, outputs: list[GenerationOutput], started: float) -> None:
        async with run.completion_lock:
            if run.is_cancelled:
                raise JobInterruptedError()
            run.is_saving = True
            batch = GenerationBatch(
                job_id=run.id,
                job=run.job,
                outputs=outputs,
                duration_ms=int((monotonic() - started) * MILLISECONDS_PER_SECOND),
                deadline=started + self.resources.settings.job_timeout_s,
            )
            ids = await self._persist(batch=batch)
            self.family = run.job.task.family
            self.events.publish(
                job_id=run.id, event=JobEvent(event="completed", data={"generation_ids": ids})
            )

    async def _persist(self, batch: GenerationBatch) -> list[str]:
        saving = asyncio.create_task(
            coro=asyncio.to_thread(
                save_generations,
                batch=batch,
                images=self.resources.images,
                repository=self.repository,
            )
        )
        try:
            return await asyncio.shield(arg=saving)
        except asyncio.CancelledError as cancellation:
            # Drain the writer before reporting a timeout or letting the next job use storage.
            try:
                await drain_task(task=saving)
            except Exception:
                logger.exception("Storage aborted during cancellation: job_id=%s", batch.job_id)
            raise cancellation

    async def _switch_family(self, run: JobRun) -> None:
        if self.family == run.job.task.family:
            return
        self.events.publish(
            job_id=run.id,
            event=JobEvent(
                event="model_switch",
                data={
                    "family": run.job.task.family,
                    "eta_s": self.resources.settings.model_switch_eta_s,
                },
            ),
        )
        if run.job.task.free_on_family_switch:
            await run.engine.free()

    async def _on_event(self, run: JobRun, event: EngineEvent) -> None:
        if isinstance(event, Queued):
            run.prompt_id = event.prompt_id
            run.is_running = False
            await asyncio.to_thread(
                self.repository.set_prompt, job_id=run.id, prompt_id=event.prompt_id
            )
        elif isinstance(event, Started):
            run.is_running = True
            await asyncio.to_thread(self.repository.set_running, job_id=run.id)
        elif isinstance(event, Progress):
            self.events.publish(
                job_id=run.id,
                event=JobEvent(
                    event="progress",
                    data={
                        "step": event.step,
                        "total": event.total,
                        "preview_url": event.preview_url,
                    },
                ),
            )

    async def finish(self, run: JobRun, status: str, error: AppError | None = None) -> None:
        await asyncio.to_thread(self.repository.finish, job_id=run.id, status=status, error=error)
        self.events.publish(job_id=run.id, event=await self.events.snapshot(job_id=run.id))

    async def _stop(self, run: JobRun, timed_out: bool = False) -> None:
        try:
            if run.is_running or timed_out:
                await run.engine.interrupt()
            if run.prompt_id is not None and not run.is_running:
                await run.engine.delete_from_queue(prompt_id=run.prompt_id)
        except AppError:
            logger.exception("Engine cancellation failed: job_id=%s", run.id)
