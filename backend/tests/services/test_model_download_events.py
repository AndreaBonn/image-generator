import asyncio
import json

import pytest
from pydantic import ValidationError

from app.services.model_download_events import (
    CancelledEvent,
    CompletedEvent,
    FailedData,
    FailedEvent,
    ModelDownloadEvents,
    ProgressData,
    ProgressEvent,
    VerifyingEvent,
)


async def test_late_subscriber_receives_latest_progress_immediately() -> None:
    events = ModelDownloadEvents()
    for done in (10, 20, 30):
        events.publish(ProgressEvent(data=ProgressData(bytes=done, total=100)))

    stream = events.stream()
    first = await anext(stream)

    assert first.event == "progress"
    assert first.data == ProgressData(bytes=30, total=100)


async def test_subscriber_receives_events_published_after_its_snapshot() -> None:
    events = ModelDownloadEvents()
    events.publish(ProgressEvent(data=ProgressData(bytes=10, total=100)))

    stream = events.stream()
    await anext(stream)  # snapshot: progress at 10
    events.publish(ProgressEvent(data=ProgressData(bytes=20, total=100)))
    events.publish(CompletedEvent())

    seen = [event.event async for event in stream]

    assert seen == ["progress", "completed"]


async def test_stream_ends_after_a_terminal_event() -> None:
    events = ModelDownloadEvents()
    stream = events.stream()

    async def produce() -> None:
        await asyncio.sleep(delay=0)
        events.publish(FailedEvent(data=FailedData(code="DOWNLOAD_FAILED", message="boom")))

    producer = asyncio.create_task(coro=produce())
    received = [(event.event, event.data) async for event in stream]
    await producer

    assert received == [("failed", FailedData(code="DOWNLOAD_FAILED", message="boom"))]


async def test_terminal_event_clears_latest_so_the_next_subscriber_starts_idle() -> None:
    events = ModelDownloadEvents()
    events.publish(ProgressEvent(data=ProgressData(bytes=10, total=100)))
    events.publish(CompletedEvent())

    assert events.latest is None


def test_failed_event_requires_a_code_and_message() -> None:
    with pytest.raises(ValidationError):
        FailedData.model_validate({})


@pytest.mark.parametrize(
    ("event", "expected_name", "expected_data"),
    [
        (
            ProgressEvent(data=ProgressData(bytes=10, total=100)),
            "progress",
            {"bytes": 10, "total": 100},
        ),
        (VerifyingEvent(), "verifying", {}),
        (CompletedEvent(), "completed", {}),
        (
            FailedEvent(data=FailedData(code="DOWNLOAD_FAILED", message="boom")),
            "failed",
            {"code": "DOWNLOAD_FAILED", "message": "boom"},
        ),
        (CancelledEvent(), "cancelled", {}),
    ],
)
def test_wire_format_matches_the_sse_payload_the_frontend_parses(
    event: ProgressEvent | VerifyingEvent | CompletedEvent | FailedEvent | CancelledEvent,
    expected_name: str,
    expected_data: dict[str, object],
) -> None:
    """Fixes the SSE wire format: frontend/src/hooks/useModelDownload.ts parses these
    exact field names (bytes/total, code/message) out of the `data:` JSON payload.
    """
    assert event.event == expected_name
    assert json.loads(json.dumps(event.data.model_dump(mode="json"))) == expected_data
