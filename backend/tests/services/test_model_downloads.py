import asyncio
from pathlib import Path

import pytest

from app.config import Settings
from app.errors import (
    ChecksumMismatchError,
    DiskFullError,
    DownloadInProgressError,
    NotFoundError,
    ValidationError,
)
from app.repositories.model_files import ProgressCallback
from app.services.model_downloads import ModelDownloads
from app.services.task_catalog import load_catalog

GB = 1024**3
ULTRASHARP = "ultrasharp_4x"


class FakeFilesRepository:
    """Boundary fake: controls what ModelFilesRepository.download() does without network I/O."""

    def __init__(self, staging_dir: Path, behavior: str = "succeed") -> None:
        self._staging_dir = staging_dir
        self.behavior = behavior
        self.calls = 0
        self.cancel_event = asyncio.Event()

    def staging_dir(self) -> Path:
        self._staging_dir.mkdir(parents=True, exist_ok=True)
        return self._staging_dir

    async def download(self, *, model: object, on_progress: ProgressCallback) -> Path:
        self.calls += 1
        on_progress(bytes_downloaded=50, total_bytes=100)
        if self.behavior == "hang":
            try:
                await self.cancel_event.wait()
            except asyncio.CancelledError:
                raise
        on_progress(bytes_downloaded=100, total_bytes=100)
        if self.behavior == "checksum_mismatch":
            raise ChecksumMismatchError()
        if self.behavior == "unexpected_error":
            raise OSError(28, "No space left on device")
        return self._staging_dir / "done.bin"


def make_downloads(
    tmp_path: Path, behavior: str = "succeed"
) -> tuple[ModelDownloads, FakeFilesRepository]:
    (tmp_path / "models").mkdir(parents=True, exist_ok=True)
    config = Settings(_env_file=None, models_dir=tmp_path / "models")
    catalog = load_catalog(settings=config)
    files = FakeFilesRepository(staging_dir=tmp_path / "models" / ".downloads", behavior=behavior)
    return ModelDownloads(catalog=catalog, files=files, config=config), files  # type: ignore[arg-type]


async def drain(downloads: ModelDownloads) -> list[str]:
    assert downloads.task is not None
    task = downloads.task
    seen: list[str] = []
    async for event in downloads.events.stream():
        seen.append(event.event)
        if event.event in {"completed", "failed", "cancelled"}:
            break
    await task
    return seen


async def test_start_runs_download_and_publishes_completed(tmp_path: Path) -> None:
    downloads, files = make_downloads(tmp_path)

    downloads.start(model_id=ULTRASHARP)
    events = await drain(downloads)

    assert events == ["progress", "progress", "verifying", "completed"]
    assert files.calls == 1
    assert downloads.current_model_id is None
    assert not (tmp_path / "models" / ".downloads" / "ultrasharp_4x.lock").exists()


async def test_second_start_while_one_active_raises_download_in_progress(tmp_path: Path) -> None:
    downloads, _files = make_downloads(tmp_path, behavior="hang")
    downloads.start(model_id=ULTRASHARP)

    with pytest.raises(DownloadInProgressError):
        downloads.start(model_id=ULTRASHARP)

    files = downloads.files
    files.cancel_event.set()  # type: ignore[attr-defined]
    assert downloads.task is not None
    await downloads.task  # drain the background task so the test leaves no stray task


async def test_unknown_model_id_raises_not_found(tmp_path: Path) -> None:
    downloads, _files = make_downloads(tmp_path)

    with pytest.raises(NotFoundError):
        downloads.start(model_id="not_a_real_model")
    assert downloads.current_model_id is None


async def test_already_installed_model_is_rejected(tmp_path: Path) -> None:
    downloads, _files = make_downloads(tmp_path)
    destination = tmp_path / "models" / "upscale_models" / "4x-UltraSharp.safetensors"
    destination.parent.mkdir(parents=True)
    destination.write_bytes(b"already here")

    with pytest.raises(ValidationError):
        downloads.start(model_id=ULTRASHARP)
    assert downloads.current_model_id is None


async def test_insufficient_disk_space_raises_disk_full_without_downloading(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    downloads, files = make_downloads(tmp_path)

    class TinyFreeSpace:
        free = 1 * GB  # far below size + 5 GB margin

    monkeypatch.setattr("shutil.disk_usage", lambda path: TinyFreeSpace())

    with pytest.raises(DiskFullError):
        downloads.start(model_id=ULTRASHARP)
    assert files.calls == 0
    assert downloads.current_model_id is None


async def test_cancel_stops_the_task_and_publishes_cancelled(tmp_path: Path) -> None:
    downloads, files = make_downloads(tmp_path, behavior="hang")
    downloads.start(model_id=ULTRASHARP)
    await asyncio.sleep(delay=0)  # let the task reach the hang point

    await downloads.cancel(model_id=ULTRASHARP)

    assert downloads.current_model_id is None
    assert not (tmp_path / "models" / ".downloads" / "ultrasharp_4x.lock").exists()


async def test_cancel_is_a_noop_when_nothing_is_downloading(tmp_path: Path) -> None:
    downloads, _files = make_downloads(tmp_path)
    await downloads.cancel(model_id=ULTRASHARP)  # must not raise
    assert downloads.current_model_id is None


async def test_lock_file_prevents_a_second_backend_instance_from_the_same_model(
    tmp_path: Path,
) -> None:
    downloads, _files = make_downloads(tmp_path, behavior="hang")
    other_downloads, other_files = make_downloads(tmp_path, behavior="hang")
    downloads.start(model_id=ULTRASHARP)

    with pytest.raises(DownloadInProgressError):
        other_downloads.start(model_id=ULTRASHARP)

    files = downloads.files
    files.cancel_event.set()  # type: ignore[attr-defined]
    assert downloads.task is not None
    await downloads.task
    assert other_files.calls == 0


async def test_checksum_mismatch_publishes_failed_with_its_code(tmp_path: Path) -> None:
    downloads, _files = make_downloads(tmp_path, behavior="checksum_mismatch")

    downloads.start(model_id=ULTRASHARP)
    task = downloads.task
    assert task is not None
    terminal = None
    async for event in downloads.events.stream():
        if event.event in {"completed", "failed", "cancelled"}:
            terminal = event
            break
    await task

    assert terminal is not None
    assert terminal.event == "failed"
    assert terminal.data.code == "CHECKSUM_MISMATCH"
    assert downloads.current_model_id is None


async def test_unexpected_error_still_publishes_failed_and_releases_the_lock(
    tmp_path: Path,
) -> None:
    downloads, _files = make_downloads(tmp_path, behavior="unexpected_error")

    downloads.start(model_id=ULTRASHARP)
    events = await drain(downloads)

    assert events[-1] == "failed"
    assert downloads.current_model_id is None
    assert not (tmp_path / "models" / ".downloads" / "ultrasharp_4x.lock").exists()
