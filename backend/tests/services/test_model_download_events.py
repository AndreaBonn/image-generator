import asyncio

from app.services.model_download_events import ModelDownloadEvent, ModelDownloadEvents


async def test_late_subscriber_receives_latest_progress_immediately() -> None:
    events = ModelDownloadEvents()
    for done in (10, 20, 30):
        events.publish(ModelDownloadEvent(event="progress", data={"bytes": done, "total": 100}))

    stream = events.stream()
    first = await anext(stream)

    assert first.event == "progress"
    assert first.data == {"bytes": 30, "total": 100}


async def test_subscriber_receives_events_published_after_its_snapshot() -> None:
    events = ModelDownloadEvents()
    events.publish(ModelDownloadEvent(event="progress", data={"bytes": 10, "total": 100}))

    stream = events.stream()
    await anext(stream)  # snapshot: progress at 10
    events.publish(ModelDownloadEvent(event="progress", data={"bytes": 20, "total": 100}))
    events.publish(ModelDownloadEvent(event="completed"))

    seen = [event.event async for event in stream]

    assert seen == ["progress", "completed"]


async def test_stream_ends_after_a_terminal_event() -> None:
    events = ModelDownloadEvents()
    stream = events.stream()

    async def produce() -> None:
        await asyncio.sleep(delay=0)
        events.publish(ModelDownloadEvent(event="failed", data={"code": "DOWNLOAD_FAILED"}))

    producer = asyncio.create_task(coro=produce())
    received = [(event.event, event.data) async for event in stream]
    await producer

    assert received == [("failed", {"code": "DOWNLOAD_FAILED"})]


async def test_terminal_event_clears_latest_so_the_next_subscriber_starts_idle() -> None:
    events = ModelDownloadEvents()
    events.publish(ModelDownloadEvent(event="progress", data={"bytes": 10, "total": 100}))
    events.publish(ModelDownloadEvent(event="completed"))

    assert events.latest is None
