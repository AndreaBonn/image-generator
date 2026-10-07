import asyncio
from collections.abc import AsyncIterator
from pathlib import Path

import httpx
import pytest
import respx

from app.config import Settings
from app.errors import ChecksumMismatchError, DownloadFailedError
from app.repositories.catalog_repository import ModelEntry
from app.repositories.model_files import ModelFilesRepository, is_trusted_redirect_host

RESOLVE_URL = "https://huggingface.co/Kim2091/UltraSharp/resolve/main/4x-UltraSharp.safetensors"
CDN_URL = "https://us.aws.cdn.hf.co/xet-bridge-us/fake-object"
CONTENT = b"fake-model-bytes"
CONTENT_SHA256 = "1f47fea1a5a0d11f806ba37a292b6f1e7694c75b391843f2852f65a5b43ef64a"


def make_model(*, tmp_path: Path, sha256: str = CONTENT_SHA256) -> ModelEntry:
    return ModelEntry.model_validate(
        {
            "id": "ultrasharp_4x",
            "label": "4x-UltraSharp",
            "source": "huggingface",
            "folder": "upscale_models",
            "filename": "4x-UltraSharp.safetensors",
            "repo": "Kim2091/UltraSharp",
            "repo_path": "4x-UltraSharp.safetensors",
            "size_bytes": len(CONTENT),
            "sha256": sha256,
        }
    )


def make_repository(*, tmp_path: Path, http: httpx.AsyncClient) -> ModelFilesRepository:
    settings = Settings(models_dir=tmp_path / "models")
    return ModelFilesRepository(http=http, config=settings)


@respx.mock
async def test_download_follows_https_redirect_verifies_hash_and_moves_into_place(
    tmp_path: Path,
) -> None:
    respx.get(RESOLVE_URL).respond(status_code=302, headers={"location": CDN_URL})
    respx.get(CDN_URL).respond(content=CONTENT)
    model = make_model(tmp_path=tmp_path)
    progress: list[int] = []
    async with httpx.AsyncClient() as http:
        repository = make_repository(tmp_path=tmp_path, http=http)
        destination = await repository.download(
            model=model,
            on_progress=lambda *, bytes_downloaded, total_bytes: progress.append(bytes_downloaded),
        )
    assert destination.read_bytes() == CONTENT
    assert destination == tmp_path / "models" / "upscale_models" / "4x-UltraSharp.safetensors"
    assert progress[-1] == len(CONTENT)
    assert not (tmp_path / "models" / ".downloads" / "ultrasharp_4x.part").exists()


@respx.mock
async def test_download_checksum_mismatch_removes_partial_and_destination(
    tmp_path: Path,
) -> None:
    respx.get(RESOLVE_URL).respond(content=CONTENT)
    model = make_model(tmp_path=tmp_path, sha256="0" * 64)
    async with httpx.AsyncClient() as http:
        repository = make_repository(tmp_path=tmp_path, http=http)
        with pytest.raises(ChecksumMismatchError):
            await repository.download(
                model=model, on_progress=lambda *, bytes_downloaded, total_bytes: None
            )
    assert not (tmp_path / "models" / ".downloads" / "ultrasharp_4x.part").exists()
    assert not (tmp_path / "models" / "upscale_models" / "4x-UltraSharp.safetensors").exists()


@respx.mock
async def test_download_server_error_raises_download_failed(tmp_path: Path) -> None:
    respx.get(RESOLVE_URL).respond(status_code=503)
    model = make_model(tmp_path=tmp_path)
    async with httpx.AsyncClient() as http:
        repository = make_repository(tmp_path=tmp_path, http=http)
        with pytest.raises(DownloadFailedError):
            await repository.download(
                model=model, on_progress=lambda *, bytes_downloaded, total_bytes: None
            )
    assert not (tmp_path / "models" / ".downloads" / "ultrasharp_4x.part").exists()


class SlowStream:
    """Fake streamed response that pauses mid-transfer until the test resumes it."""

    def __init__(self, chunks: list[bytes]) -> None:
        self.chunks = chunks
        self.headers = {"content-length": str(sum(len(chunk) for chunk in chunks))}
        self.resume = asyncio.Event()
        self.closed = False

    async def aiter_bytes(self, _size: int) -> AsyncIterator[bytes]:
        yield self.chunks[0]
        await self.resume.wait()
        yield self.chunks[1]

    async def aclose(self) -> None:
        self.closed = True


async def test_download_cancelled_closes_stream_and_removes_partial(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    model = make_model(tmp_path=tmp_path)
    stream = SlowStream(chunks=[b"fake-model", b"-bytes"])
    async with httpx.AsyncClient() as http:
        repository = make_repository(tmp_path=tmp_path, http=http)
        monkeypatch.setattr(repository, "_open_stream", lambda *, url: _resolved(stream))
        task = asyncio.create_task(
            repository.download(
                model=model, on_progress=lambda *, bytes_downloaded, total_bytes: None
            )
        )
        staging_path = tmp_path / "models" / ".downloads" / "ultrasharp_4x.part"
        async with asyncio.timeout(delay=5):
            while not staging_path.exists():
                await asyncio.sleep(delay=0.01)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    assert stream.closed
    assert not staging_path.exists()
    assert not (tmp_path / "models" / "upscale_models" / "4x-UltraSharp.safetensors").exists()


async def _resolved(stream: SlowStream) -> SlowStream:
    return stream


@respx.mock
async def test_download_rejects_non_https_redirect(tmp_path: Path) -> None:
    respx.get(RESOLVE_URL).respond(
        status_code=302, headers={"location": "http://evil.example/model.bin"}
    )
    model = make_model(tmp_path=tmp_path)
    async with httpx.AsyncClient() as http:
        repository = make_repository(tmp_path=tmp_path, http=http)
        with pytest.raises(DownloadFailedError):
            await repository.download(
                model=model, on_progress=lambda *, bytes_downloaded, total_bytes: None
            )
    assert not (tmp_path / "models" / ".downloads" / "ultrasharp_4x.part").exists()


@respx.mock
async def test_download_rejects_https_redirect_outside_hugging_face(tmp_path: Path) -> None:
    respx.get(RESOLVE_URL).respond(
        status_code=302, headers={"location": "https://evil.example/model.bin"}
    )
    evil = respx.get("https://evil.example/model.bin").respond(content=CONTENT)
    model = make_model(tmp_path=tmp_path)
    async with httpx.AsyncClient() as http:
        repository = make_repository(tmp_path=tmp_path, http=http)
        with pytest.raises(DownloadFailedError, match="non affidabile"):
            await repository.download(
                model=model, on_progress=lambda *, bytes_downloaded, total_bytes: None
            )
    assert not evil.called


@respx.mock
async def test_download_disk_error_raises_download_failed_and_removes_partial(
    tmp_path: Path,
) -> None:
    respx.get(RESOLVE_URL).respond(content=CONTENT)
    model = make_model(tmp_path=tmp_path)

    def fail_like_a_full_disk(*, bytes_downloaded: int, total_bytes: int) -> None:
        raise OSError(28, "No space left on device")

    async with httpx.AsyncClient() as http:
        repository = make_repository(tmp_path=tmp_path, http=http)
        with pytest.raises(DownloadFailedError):
            await repository.download(model=model, on_progress=fail_like_a_full_disk)

    assert list((tmp_path / "models" / ".downloads").iterdir()) == []
    assert not repository.destination(model=model).exists()


@pytest.mark.parametrize(
    ("host", "expected"),
    [
        ("huggingface.co", True),
        ("cdn-lfs.huggingface.co", True),
        ("us.aws.cdn.hf.co", True),
        ("evilhf.co", False),
        ("huggingface.co.evil.example", False),
    ],
)
def test_is_trusted_redirect_host_accepts_only_hugging_face_domains(
    host: str, expected: bool
) -> None:
    assert is_trusted_redirect_host(host=host) is expected
