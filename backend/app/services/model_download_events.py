import asyncio
from collections.abc import AsyncIterator
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

TERMINAL_EVENTS = frozenset({"completed", "failed", "cancelled"})


class ProgressData(BaseModel):
    model_config = ConfigDict(frozen=True)
    bytes: int = Field(ge=0)
    total: int = Field(ge=0)


class FailedData(BaseModel):
    model_config = ConfigDict(frozen=True)
    code: str
    message: str


class EmptyData(BaseModel):
    model_config = ConfigDict(frozen=True)


class ProgressEvent(BaseModel):
    event: Literal["progress"] = "progress"
    data: ProgressData
    # Monotonic per-process counter set by publish(); lets a late subscriber drop
    # events already reflected in the snapshot it received on connect.
    seq: int = Field(default=0, exclude=True)


class VerifyingEvent(BaseModel):
    event: Literal["verifying"] = "verifying"
    data: EmptyData = Field(default_factory=EmptyData)
    seq: int = Field(default=0, exclude=True)


class CompletedEvent(BaseModel):
    event: Literal["completed"] = "completed"
    data: EmptyData = Field(default_factory=EmptyData)
    seq: int = Field(default=0, exclude=True)


class FailedEvent(BaseModel):
    event: Literal["failed"] = "failed"
    data: FailedData
    seq: int = Field(default=0, exclude=True)


class CancelledEvent(BaseModel):
    event: Literal["cancelled"] = "cancelled"
    data: EmptyData = Field(default_factory=EmptyData)
    seq: int = Field(default=0, exclude=True)


ModelDownloadEvent = Annotated[
    ProgressEvent | VerifyingEvent | CompletedEvent | FailedEvent | CancelledEvent,
    Field(discriminator="event"),
]


class ModelDownloadEvents:
    """Broadcasts the single, app-wide model download to every connected SSE client.

    Unlike JobEvents there is no per-id keying and no repository: at most one
    download runs at a time (app/services/model_downloads.py enforces that), so a
    late subscriber only needs the last progress event, kept in memory here.
    """

    def __init__(self) -> None:
        self.subscribers: set[asyncio.Queue[ModelDownloadEvent]] = set()
        self.latest: ModelDownloadEvent | None = None
        self._next_seq = 0

    def publish(self, event: ModelDownloadEvent) -> None:
        self._next_seq += 1
        event = event.model_copy(update={"seq": self._next_seq})
        self.latest = None if event.event in TERMINAL_EVENTS else event
        for queue in self.subscribers:
            queue.put_nowait(item=event)

    async def stream(self) -> AsyncIterator[ModelDownloadEvent]:
        queue: asyncio.Queue[ModelDownloadEvent] = asyncio.Queue()
        self.subscribers.add(queue)
        initial = self.latest
        try:
            if initial is not None:
                yield initial
            while True:
                event = await queue.get()
                if initial is not None and event.seq <= initial.seq:
                    continue  # published while subscribing, already in the snapshot
                yield event
                if event.event in TERMINAL_EVENTS:
                    return
        finally:
            self.subscribers.discard(queue)
