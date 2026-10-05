import asyncio
import logging
from threading import Event
from typing import Any

import pytest
from test_jobs import JobApp, wait_terminal
from test_jobs import job_app as job_app

from app.engine.fake_engine import FakeEngine
from app.models.job import JobRequest


async def test_create_job_missing_task_id_returns_required_field_error(job_app: JobApp) -> None:
    _, client = job_app

    response = await client.post(url="/api/v1/jobs", json={"prompt": "cat"})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert {"field": "task_id", "message": "Campo obbligatorio."} in response.json()["error"][
        "details"
    ]


@pytest.mark.parametrize("field", ["unexpected", "params.unexpected"])
async def test_create_job_extra_field_returns_forbidden_field_error(
    job_app: JobApp, field: str
) -> None:
    _, client = job_app
    extra: dict[str, object] = (
        {"unexpected": True} if field == "unexpected" else {"params": {"unexpected": True}}
    )

    response = await client.post(url="/api/v1/jobs", json={"task_id": "bozza", **extra})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert {"field": field, "message": "Campo non previsto."} in response.json()["error"]["details"]


async def test_create_job_malformed_json_returns_translated_error(job_app: JobApp) -> None:
    _, client = job_app

    response = await client.post(
        url="/api/v1/jobs", content=b"{", headers={"Content-Type": "application/json"}
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert response.json()["error"]["details"] == [
        {"field": "1", "message": "Il corpo della richiesta non è un JSON valido."}
    ]


@pytest.mark.parametrize("cancel_count", [1, 2])
async def test_disconnected_submit_still_schedules_committed_job(
    job_app: JobApp, monkeypatch: pytest.MonkeyPatch, cancel_count: int
) -> None:
    service = job_app[0].state.job_service
    committed, release = Event(), Event()
    original = service.repository.create
    created_ids = []

    def blocked_create(**kwargs: Any) -> Any:
        result = original(**kwargs)
        created_ids.append(result[0].id)
        committed.set()
        assert release.wait(timeout=3)
        return result

    monkeypatch.setattr(service.repository, "create", blocked_create)
    pending = asyncio.create_task(
        service.submit(
            request=JobRequest(task_id="bozza", prompt="cat"), engine=FakeEngine(step_delay_s=0)
        )
    )
    await asyncio.to_thread(committed.wait, timeout=3)
    for _ in range(cancel_count):
        pending.cancel()
        await asyncio.sleep(delay=0)
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await pending
    result = await wait_terminal(client=job_app[1], job_id=created_ids[0])
    assert result["status"] == "completed"


@pytest.mark.parametrize("cancel_count", [1, 2])
async def test_disconnected_submit_logs_when_the_inner_submission_fails(
    job_app: JobApp,
    monkeypatch: pytest.MonkeyPatch,
    cancel_count: int,
    caplog: pytest.LogCaptureFixture,
) -> None:
    service = job_app[0].state.job_service
    committed, release = Event(), Event()

    def blocked_create(**kwargs: Any) -> Any:
        committed.set()
        assert release.wait(timeout=3)
        raise RuntimeError("boom: unrelated repository failure")

    monkeypatch.setattr(service.repository, "create", blocked_create)
    pending = asyncio.create_task(
        service.submit(
            request=JobRequest(task_id="bozza", prompt="cat"), engine=FakeEngine(step_delay_s=0)
        )
    )
    await asyncio.to_thread(committed.wait, timeout=3)
    for _ in range(cancel_count):
        pending.cancel()
        await asyncio.sleep(delay=0)
    release.set()
    with caplog.at_level(logging.ERROR):
        with pytest.raises(asyncio.CancelledError):
            await pending
    assert "Job submission failed after caller disconnected" in caplog.text


async def test_sse_replays_model_switch_for_late_subscriber(job_app: JobApp) -> None:
    application, client = job_app
    service = application.state.job_service
    from test_job_events import QueueGate

    engine = QueueGate()
    job_id = await service.submit(request=JobRequest(task_id="bozza", prompt="cat"), engine=engine)
    await engine.queued.wait()
    stream = service.events.stream(job_id=job_id)
    initial = await anext(stream)
    engine.release.set()
    await stream.aclose()
    assert initial.event == "model_switch"
    assert initial.data == {"family": "sdxl", "eta_s": 13}
    assert (await wait_terminal(client=client, job_id=job_id))["status"] == "completed"
