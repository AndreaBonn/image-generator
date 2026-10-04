import asyncio
import json
from collections.abc import AsyncGenerator, AsyncIterator
from io import BytesIO
from typing import Literal, cast

import pytest
from PIL import Image
from test_jobs import JobApp, wait_terminal
from test_jobs import job_app as job_app

from app.api.v1.jobs import get_engine, stream_events
from app.engine.fake_engine import FakeEngine
from app.engine.types import EngineEvent, EngineRequest, Failed, PreviewImage
from app.errors import EngineExecutionError


class PreviewGate(FakeEngine):
    def __init__(self, fail: bool = False) -> None:
        super().__init__(step_delay_s=0)
        self.ready = asyncio.Queue[int]()
        self.release = asyncio.Event()
        self.fail = fail

    async def run(self, request: EngineRequest) -> AsyncGenerator[EngineEvent, None]:
        index = 0
        async for event in super().run(request=request):
            yield event
            if isinstance(event, PreviewImage):
                index += 1
                self.ready.put_nowait(item=index)
                await self.release.wait()
                self.release.clear()
                if self.fail:
                    yield Failed(error=EngineExecutionError())
                    return


@pytest.fixture
async def preview_job(job_app: JobApp) -> AsyncIterator[tuple[JobApp, PreviewGate, str]]:
    application, client = job_app
    engine = PreviewGate()
    application.dependency_overrides[get_engine] = lambda: engine
    response = await client.post(url="/api/v1/jobs", json={"task_id": "bozza", "prompt": "cat"})
    job_id = response.json()["data"]["job_id"]
    async with asyncio.timeout(delay=5):
        assert await engine.ready.get() == 1
    try:
        yield job_app, engine, job_id
    finally:
        await application.state.job_service.cancel(job_id=job_id)


async def test_preview_endpoint_returns_jpeg_and_sse_serializes_exact_url(
    preview_job: tuple[JobApp, PreviewGate, str],
) -> None:
    (application, client), _, job_id = preview_job
    stream = cast(
        AsyncGenerator[dict[str, str], None],
        stream_events(service=application.state.job_service, job_id=job_id),
    )
    event = await anext(stream)
    await stream.aclose()
    assert event == {
        "event": "preview",
        "data": json.dumps({"url": f"/api/v1/jobs/{job_id}/preview?n=1"}),
    }
    response = await client.get(url=json.loads(event["data"])["url"])
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/jpeg"
    assert response.headers["cache-control"] == "no-store"
    with Image.open(fp=BytesIO(response.content)) as image:
        assert image.format == "JPEG"
        image.load()


async def test_runner_replaces_preview_and_increments_counter(
    preview_job: tuple[JobApp, PreviewGate, str],
) -> None:
    (application, client), engine, job_id = preview_job
    service = application.state.job_service
    stream = service.events.stream(job_id=job_id)
    assert (await anext(stream)).data == {"url": f"/api/v1/jobs/{job_id}/preview?n=1"}
    output = BytesIO()
    Image.new(mode="RGB", size=(3, 2), color="red").save(fp=output, format="PNG")
    preview = PreviewImage(content=output.getvalue(), media_type="image/png")
    await service.runner._on_event(run=service.runs[job_id], event=preview)
    assert (await anext(stream)).data == {"url": f"/api/v1/jobs/{job_id}/preview?n=2"}
    assert service.runner.previews == {job_id: preview}
    response = await client.get(url=f"/api/v1/jobs/{job_id}/preview?n=1")
    assert response.content == output.getvalue()
    assert response.headers["content-type"] == "image/png"
    engine.release.set()
    async with asyncio.timeout(delay=5):
        assert await engine.ready.get() == 2
    assert (await anext(stream)).data == {"step": 2, "total": 4}
    assert (await anext(stream)).data == {"url": f"/api/v1/jobs/{job_id}/preview?n=3"}
    await stream.aclose()


@pytest.mark.parametrize("outcome", ["completed", "failed", "cancelled"])
async def test_terminal_job_drops_preview_and_replays_only_terminal(
    preview_job: tuple[JobApp, PreviewGate, str],
    outcome: Literal["completed", "failed", "cancelled"],
) -> None:
    (application, client), engine, job_id = preview_job
    assert (await client.get(url=f"/api/v1/jobs/{job_id}/preview")).status_code == 200
    if outcome == "cancelled":
        await client.post(url=f"/api/v1/jobs/{job_id}/cancel")
    else:
        engine.fail = outcome == "failed"
        for step in range(2, 5) if outcome == "completed" else ():
            engine.release.set()
            async with asyncio.timeout(delay=5):
                assert await engine.ready.get() == step
        engine.release.set()
    assert (await wait_terminal(client=client, job_id=job_id))["status"] == outcome
    missing = await client.get(url=f"/api/v1/jobs/{job_id}/preview")
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "NOT_FOUND"
    assert missing.json()["error"]["message"] == "Anteprima non disponibile."
    assert application.state.job_service.runner.previews == {}
    assert job_id not in application.state.job_service.events.latest
    stream = application.state.job_service.events.stream(job_id=job_id)
    assert [event.event async for event in stream] == [outcome]


async def test_missing_preview_returns_not_found(job_app: JobApp) -> None:
    application, client = job_app
    queued, _ = application.state.job_service.repository.create(
        request={"task_id": "bozza"}, idempotency_key=None
    )
    for job_id in (queued.id, "00000000-0000-0000-0000-000000000000"):
        response = await client.get(url=f"/api/v1/jobs/{job_id}/preview")
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "NOT_FOUND"
        assert response.json()["error"]["message"] == "Anteprima non disponibile."
