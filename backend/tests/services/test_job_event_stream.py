import asyncio
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from typing import cast

import pytest

from app.repositories.job_repository import JobRepository
from app.services.job_events import JobEvent, JobEvents


@dataclass
class RunningJob:
    status: str = "running"
    error_code: str | None = None
    error_message: str | None = None


class RunningJobRepository:
    def __init__(
        self,
        jobs: dict[str, RunningJob] | None = None,
        generation_ids: dict[str, list[str]] | None = None,
        positions: dict[str, int] | None = None,
    ) -> None:
        self.jobs = jobs if jobs is not None else {}
        self.ids = generation_ids if generation_ids is not None else {}
        self.positions = positions if positions is not None else {}

    def get(self, job_id: str) -> RunningJob:
        return self.jobs.get(job_id, RunningJob())

    def generation_ids(self, job_id: str) -> list[str]:
        return self.ids.get(job_id, [])

    def queue_position(self, job_id: str) -> int:
        return self.positions.get(job_id, 0)


def make_events() -> JobEvents:
    return JobEvents(repository=cast(JobRepository, RunningJobRepository()))


async def test_stream_does_not_repeat_an_event_published_while_subscribing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    events = make_events()
    subscribed = asyncio.Event()
    original_snapshot = events.snapshot

    async def snapshot_after_subscribing(job_id: str) -> JobEvent:
        # self.subscribers already holds our queue by the time stream() calls
        # snapshot() (see app/services/job_events.py); set() here is the
        # deterministic signal that the race window the test targets is open.
        subscribed.set()
        return await original_snapshot(job_id=job_id)

    monkeypatch.setattr(events, "snapshot", snapshot_after_subscribing)
    stream = events.stream(job_id="job-1")
    first_pending = asyncio.ensure_future(coro_or_future=anext(stream))
    await subscribed.wait()
    events.publish(job_id="job-1", event=JobEvent(event="progress", data={"step": 1, "total": 4}))

    first = await first_pending
    events.publish(
        job_id="job-1", event=JobEvent(event="completed", data={"generation_ids": ["g"]})
    )
    second = await stream.__anext__()

    assert first.event == "progress"
    assert second.event == "completed"


async def test_stream_delivers_every_event_published_after_the_snapshot() -> None:
    events = make_events()
    events.publish(job_id="job-2", event=JobEvent(event="progress", data={"step": 1, "total": 4}))
    stream = events.stream(job_id="job-2")

    first = await stream.__anext__()
    events.publish(job_id="job-2", event=JobEvent(event="progress", data={"step": 2, "total": 4}))
    second = await stream.__anext__()

    assert first.data == {"step": 1, "total": 4}
    assert second.data == {"step": 2, "total": 4}


async def test_snapshot_completed_returns_generation_ids() -> None:
    repository = RunningJobRepository(
        jobs={"job-completed": RunningJob(status="completed")},
        generation_ids={"job-completed": ["generation-2", "generation-1"]},
    )
    events = JobEvents(repository=cast(JobRepository, repository))

    snapshot = await events.snapshot(job_id="job-completed")

    assert snapshot.event == "completed"
    assert snapshot.data == {"generation_ids": ["generation-2", "generation-1"]}


async def test_snapshot_failed_returns_error_code_and_message() -> None:
    repository = RunningJobRepository(
        jobs={
            "job-failed": RunningJob(
                status="failed", error_code="ENGINE_REJECTED", error_message="Request rejected"
            )
        }
    )
    events = JobEvents(repository=cast(JobRepository, repository))

    snapshot = await events.snapshot(job_id="job-failed")

    assert snapshot.event == "failed"
    assert snapshot.data == {"code": "ENGINE_REJECTED", "message": "Request rejected"}


async def test_snapshot_cancelled_returns_empty_data() -> None:
    repository = RunningJobRepository(jobs={"job-cancelled": RunningJob(status="cancelled")})
    events = JobEvents(repository=cast(JobRepository, repository))

    snapshot = await events.snapshot(job_id="job-cancelled")

    assert snapshot.event == "cancelled"
    assert snapshot.data == {}


async def test_snapshot_without_published_event_returns_queue_position() -> None:
    repository = RunningJobRepository(
        jobs={"job-queued": RunningJob(status="queued")}, positions={"job-queued": 3}
    )
    events = JobEvents(repository=cast(JobRepository, repository))
    assert events.latest == {}

    snapshot = await events.snapshot(job_id="job-queued")

    assert snapshot.event == "queued"
    assert snapshot.data == {"position": 3}


async def test_stream_aclose_removes_subscriber_and_empty_entry() -> None:
    events = make_events()
    stream = cast(AsyncGenerator[JobEvent, None], events.stream(job_id="job-running"))

    try:
        first = await anext(stream)
        assert first.event == "queued"
        assert "job-running" in events.subscribers
        queues = events.subscribers["job-running"]
        assert len(queues) == 1
        queue = next(iter(queues))
        assert isinstance(queue, asyncio.Queue)
        assert queue in events.subscribers["job-running"]
    finally:
        await stream.aclose()

    assert queues == set()
    assert "job-running" not in events.subscribers
