import asyncio
import hashlib
from collections.abc import AsyncIterator
from pathlib import Path

import httpx
import pytest
import respx
from fastapi import FastAPI

from app.config import Settings
from app.main import create_app

type ModelApp = tuple[FastAPI, httpx.AsyncClient]

ULTRASHARP = "ultrasharp_4x"
RESOLVE_URL = "https://huggingface.co/Kim2091/UltraSharp/resolve/main/4x-UltraSharp.safetensors"


@pytest.fixture
async def model_app(tmp_path: Path) -> AsyncIterator[ModelApp]:
    (tmp_path / "models").mkdir()
    config = Settings(
        engine_mode="fake",
        data_dir=tmp_path,
        styles_dir=tmp_path / "styles",
        models_dir=tmp_path / "models",
    )
    application = create_app(config=config)
    async with application.router.lifespan_context(application):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=application), base_url="http://test"
        ) as client:
            yield application, client


@respx.mock
async def test_install_returns_202_and_events_stream_completes(model_app: ModelApp) -> None:
    application, client = model_app
    content = b"x" * 16
    application.state.model_downloads.catalog.models[ULTRASHARP].sha256 = hashlib.sha256(
        content
    ).hexdigest()
    respx.get(RESOLVE_URL).respond(content=content)
    stream = application.state.model_downloads.events.stream()

    response = await client.post(url=f"/api/v1/models/{ULTRASHARP}/install")

    assert response.status_code == 202
    assert response.json() == {"data": {"status": "started"}}
    events = [event.event async for event in stream]
    assert events[-1] == "completed"


async def test_install_unknown_id_returns_404(model_app: ModelApp) -> None:
    _, client = model_app

    response = await client.post(url="/api/v1/models/not_a_real_model/install")

    assert response.status_code == 404


@pytest.mark.parametrize("model_id", ["--help", "..%2fsecret"])
async def test_install_path_like_id_returns_404_without_filesystem_access(
    model_app: ModelApp, model_id: str
) -> None:
    _, client = model_app

    response = await client.post(url=f"/api/v1/models/{model_id}/install")

    assert response.status_code == 404


async def test_install_already_installed_rejected(model_app: ModelApp, tmp_path: Path) -> None:
    _, client = model_app
    destination = tmp_path / "models" / "upscale_models" / "4x-UltraSharp.safetensors"
    destination.parent.mkdir(parents=True)
    destination.write_bytes(b"already here")

    response = await client.post(url=f"/api/v1/models/{ULTRASHARP}/install")

    assert response.status_code == 422


async def test_second_install_while_one_active_returns_409(model_app: ModelApp) -> None:
    application, client = model_app
    hang = asyncio.Event()

    async def hanging_download(*, model: object, on_progress: object) -> None:
        await hang.wait()

    application.state.model_downloads.files.download = hanging_download

    first = await client.post(url=f"/api/v1/models/{ULTRASHARP}/install")
    second = await client.post(url=f"/api/v1/models/{ULTRASHARP}/install")
    hang.set()
    await application.state.model_downloads.cancel(model_id=ULTRASHARP)

    assert first.status_code == 202
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "DOWNLOAD_IN_PROGRESS"


async def test_install_insufficient_disk_space_returns_507_without_http_call(
    model_app: ModelApp, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, client = model_app

    class TinyFreeSpace:
        free = 0

    monkeypatch.setattr("shutil.disk_usage", lambda path: TinyFreeSpace())
    with respx.mock(assert_all_called=False) as router:
        router.get(RESOLVE_URL).respond(content=b"x")
        response = await client.post(url=f"/api/v1/models/{ULTRASHARP}/install")
        assert not router.calls

    assert response.status_code == 507
    assert response.json()["error"]["code"] == "DISK_FULL"


async def test_install_is_guarded_against_cross_site_requests(model_app: ModelApp) -> None:
    _, client = model_app

    response = await client.post(
        url=f"/api/v1/models/{ULTRASHARP}/install", headers={"Sec-Fetch-Site": "cross-site"}
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "CROSS_SITE_REQUEST"


async def test_cancel_unknown_model_is_a_noop(model_app: ModelApp) -> None:
    _, client = model_app

    response = await client.post(url=f"/api/v1/models/{ULTRASHARP}/install/cancel")

    assert response.status_code == 200
    assert response.json() == {"data": {"status": "cancelled"}}
