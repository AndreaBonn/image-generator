import json
import struct
from io import BytesIO
from pathlib import Path
from typing import Literal

import httpx
import pytest
import respx
from PIL import Image
from pydantic import ValidationError
from test_comfy_engine_stream import PROMPT_ID, URL, FakeSocket, message, request, run_engine

from app.config import Settings
from app.engine.comfy_client import ComfyClient
from app.engine.fake_engine import FAKE_STEPS, FakeEngine
from app.engine.previews import parse_preview
from app.engine.types import Interrupted, PreviewImage, Progress, Queued, Started
from app.main import create_app

FIXTURE = Path(__file__).parents[1] / "fixtures/ws/preview_jpeg.bin"


def test_parse_preview_reads_real_jpeg_frame() -> None:
    frame = FIXTURE.read_bytes()
    preview = parse_preview(frame=frame)
    assert preview == PreviewImage(content=frame[8:], media_type="image/jpeg")
    with Image.open(fp=BytesIO(preview.content)) as image:
        assert image.format == "JPEG"
        image.load()


def test_parse_preview_reads_png_frame() -> None:
    output = BytesIO()
    Image.new(mode="RGB", size=(2, 2)).save(fp=output, format="PNG")
    content = output.getvalue()
    assert parse_preview(frame=struct.pack(">II", 1, 2) + content) == PreviewImage(
        content=content, media_type="image/png"
    )


@pytest.mark.parametrize(
    "frame",
    [
        b"",
        b"\x00" * 7,
        struct.pack(">II", 1, 1),
        struct.pack(">II", 2, 1) + b"image",
        struct.pack(">II", 1, 3) + b"image",
    ],
)
def test_parse_preview_ignores_short_or_unknown_frames(frame: bytes) -> None:
    assert parse_preview(frame=FIXTURE.read_bytes()) is not None
    assert parse_preview(frame=frame) is None


@respx.mock
async def test_comfy_stream_preserves_progress_preview_order() -> None:
    respx.post(URL + "/prompt").respond(json={"prompt_id": PROMPT_ID})
    frame = FIXTURE.read_bytes()
    socket = FakeSocket(
        frames=[
            message("execution_start"),
            message("progress", node="6", value=1, max=4),
            frame,
            message("progress", node="6", value=2, max=4),
            frame,
            message("execution_interrupted"),
        ]
    )
    assert await run_engine(socket=socket) == [
        Queued(prompt_id=PROMPT_ID),
        Started(),
        Progress(step=1, total=4),
        PreviewImage(content=frame[8:], media_type="image/jpeg"),
        Progress(step=2, total=4),
        PreviewImage(content=frame[8:], media_type="image/jpeg"),
        Interrupted(),
    ]


@pytest.mark.parametrize("method", ["latent2rgb", "none"])
@respx.mock
async def test_queue_prompt_obeys_preview_setting(method: Literal["latent2rgb", "none"]) -> None:
    prompt = respx.post(URL + "/prompt").respond(json={"prompt_id": "p"})
    config = Settings(preview_method=method)
    async with httpx.AsyncClient(base_url=URL) as http:
        client = ComfyClient(http=http, config=config)
        assert await client.queue_prompt(graph={"1": {}}, client_id="c") == "p"
    expected = {"prompt": {"1": {}}, "client_id": "c"}
    if method != "none":
        expected["extra_data"] = {"preview_method": "latent2rgb"}
    assert json.loads(prompt.calls[0].request.content) == expected


def test_preview_setting_reads_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(name="PREVIEW_METHOD", raising=False)
    assert Settings(_env_file=None).preview_method == "latent2rgb"
    monkeypatch.setenv(name="PREVIEW_METHOD", value="none")
    assert Settings(_env_file=None).preview_method == "none"
    monkeypatch.setenv(name="PREVIEW_METHOD", value="unknown")
    with pytest.raises(ValidationError, match="preview_method"):
        Settings(_env_file=None)


@pytest.mark.parametrize("method", ["latent2rgb", "none"])
@respx.mock
async def test_lifespan_passes_preview_configuration_to_comfy_client(
    tmp_path: Path, method: Literal["latent2rgb", "none"]
) -> None:
    prompt = respx.post(URL + "/prompt").respond(json={"prompt_id": "p"})
    config = Settings(engine_mode="comfy", preview_method=method, data_dir=tmp_path)
    application = create_app(config=config)
    async with application.router.lifespan_context(application):
        await application.state.engine.client.queue_prompt(graph={}, client_id="c")
    expected = {"prompt": {}, "client_id": "c"}
    if method != "none":
        expected["extra_data"] = {"preview_method": "latent2rgb"}
    assert json.loads(prompt.calls[0].request.content) == expected


async def test_fake_engine_emits_valid_jpeg_after_every_progress() -> None:
    events = [event async for event in FakeEngine(step_delay_s=0).run(request=request())]
    previews = [event for event in events if isinstance(event, PreviewImage)]
    assert len(previews) == FAKE_STEPS
    for index, event in enumerate(events):
        if isinstance(event, Progress):
            preview = events[index + 1]
            assert isinstance(preview, PreviewImage)
            assert preview.media_type == "image/jpeg"
            with Image.open(fp=BytesIO(preview.content)) as image:
                assert image.format == "JPEG"
                image.load()
