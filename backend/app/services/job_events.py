import asyncio
from collections.abc import AsyncIterator
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.repositories.job_repository import TERMINAL_STATUSES, JobRepository

EventName = Literal["queued", "model_switch", "progress", "completed", "failed", "cancelled"]


class JobEvent(BaseModel):
    event: EventName
    data: dict[str, Any] = Field(default_factory=dict)
    # Monotonic per-process counter set by publish(); lets a late subscriber drop
    # queued events already reflected in its snapshot. Never sent to clients.
    seq: int = Field(default=0, exclude=True)


class JobEvents:
    def __init__(self, repository: JobRepository) -> None:
        self.repository = repository
        self.subscribers: dict[str, set[asyncio.Queue[JobEvent]]] = {}
        self.latest: dict[str, JobEvent] = {}
        self._next_seq = 0

    def publish(self, job_id: str, event: JobEvent) -> None:
        self._next_seq += 1
        event = event.model_copy(update={"seq": self._next_seq})
        if event.event in TERMINAL_STATUSES:
            self.latest.pop(job_id, None)
        else:
            self.latest[job_id] = event
        for queue in self.subscribers.get(job_id, set()):
            queue.put_nowait(item=event)

    async def snapshot(self, job_id: str) -> JobEvent:
        job = await asyncio.to_thread(self.repository.get, job_id=job_id)
        if job.status == "completed":
            ids = await asyncio.to_thread(self.repository.generation_ids, job_id=job_id)
            return JobEvent(event="completed", data={"generation_ids": ids})
        if job.status == "failed":
            return JobEvent(
                event="failed", data={"code": job.error_code, "message": job.error_message}
            )
        if job.status == "cancelled":
            return JobEvent(event="cancelled")
        if job_id in self.latest:
            return self.latest[job_id]
        position = await asyncio.to_thread(self.repository.queue_position, job_id=job_id)
        return JobEvent(event="queued", data={"position": position})

    async def stream(self, job_id: str) -> AsyncIterator[JobEvent]:
        queue: asyncio.Queue[JobEvent] = asyncio.Queue()
        self.subscribers.setdefault(job_id, set()).add(queue)
        try:
            initial = await self.snapshot(job_id=job_id)
            yield initial
            if initial.event in TERMINAL_STATUSES:
                return
            while True:
                event = await queue.get()
                if event.seq <= initial.seq:
                    continue  # published while subscribing, already in the snapshot
                yield event
                if event.event in TERMINAL_STATUSES:
                    return
        finally:
            self.subscribers[job_id].discard(queue)
            if not self.subscribers[job_id]:
                del self.subscribers[job_id]
