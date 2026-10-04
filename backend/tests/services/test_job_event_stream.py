import asyncio
from dataclasses import dataclass
from typing import cast

from app.repositories.job_repository import JobRepository
from app.services.job_events import JobEvent, JobEvents


@dataclass
class RunningJob:
    status: str = "running"
    error_code: str | None = None
    error_message: str | None = None


class RunningJobRepository:
    def get(self, job_id: str) -> RunningJob:
        return RunningJob()

    def generation_ids(self, job_id: str) -> list[str]:
        return []

    def queue_position(self, job_id: str) -> int:
        return 0


def make_events() -> JobEvents:
    return JobEvents(repository=cast(JobRepository, RunningJobRepository()))


async def test_stream_does_not_repeat_an_event_published_while_subscribing() -> None:
    events = make_events()
    stream = events.stream(job_id="job-1")
    first_pending = asyncio.ensure_future(coro_or_future=anext(stream))
    await asyncio.sleep(0)  # let the stream subscribe and start its snapshot
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
