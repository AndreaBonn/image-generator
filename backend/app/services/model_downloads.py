import asyncio
import logging
import os
import shutil
from pathlib import Path

from app.config import Settings
from app.errors import (
    AppError,
    ChecksumMismatchError,
    DiskFullError,
    DownloadFailedError,
    DownloadInProgressError,
    NotFoundError,
    ValidationError,
)
from app.repositories.catalog_repository import ModelEntry
from app.repositories.model_files import ModelFilesRepository
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
from app.services.model_space import GB, has_room, lock_filename
from app.services.task_catalog import TaskCatalog

logger = logging.getLogger(__name__)


class ModelDownloads:
    """Orchestrates the single, app-wide model download triggered from Settings.

    Only one download runs at a time: a second call to start() while one is active
    raises DownloadInProgressError. A file lock in MODELS_DIR/.downloads is shared
    with scripts/install_models.py so the CLI refuses a concurrent download of the
    same model id started from the app.
    """

    def __init__(self, catalog: TaskCatalog, files: ModelFilesRepository, config: Settings) -> None:
        self.catalog = catalog
        self.files = files
        self.config = config
        self.events = ModelDownloadEvents()
        self.current_model_id: str | None = None
        self.task: asyncio.Task[None] | None = None

    def _lock_path(self, model_id: str) -> Path:
        return self.files.staging_dir() / lock_filename(model_id=model_id)

    def _resolve_downloadable(self, model_id: str) -> ModelEntry:
        model = self.catalog.models.get(model_id)
        if model is None or model.source != "huggingface" or not model.enabled:
            raise NotFoundError(
                message=f"Il modello «{model_id}» non è disponibile per il download."
            )
        if self.catalog.repository.has_model(model=model):
            raise ValidationError(message=f"{model.label} è già installato.")
        return model

    def _require_room(self, model: ModelEntry) -> None:
        free_bytes = shutil.disk_usage(self.config.models_dir).free
        if has_room(
            free_bytes=free_bytes,
            size_bytes=model.size_bytes,
            min_free_gb=self.config.min_free_disk_gb,
        ):
            return
        raise DiskFullError(
            message=(
                f"Servono {model.size_bytes / GB:.1f} GB più "
                f"{self.config.min_free_disk_gb:.0f} GB di margine, liberi solo "
                f"{free_bytes / GB:.1f} GB."
            )
        )

    def _acquire_lock(self, model_id: str) -> Path:
        lock_path = self._lock_path(model_id=model_id)
        try:
            os.close(os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY))
        except FileExistsError as error:
            raise DownloadInProgressError(
                message="Un'altra sessione (o la CLI) sta già scaricando questo modello."
            ) from error
        return lock_path

    def start(self, model_id: str) -> None:
        """Validate and kick off the download as a background task; returns immediately."""
        if self.current_model_id is not None:
            raise DownloadInProgressError()
        model = self._resolve_downloadable(model_id=model_id)
        self._require_room(model=model)
        lock_path = self._acquire_lock(model_id=model_id)
        self.current_model_id = model_id
        self.task = asyncio.create_task(
            coro=self._run(model=model, lock_path=lock_path), name=f"model-download-{model_id}"
        )

    async def _run(self, model: ModelEntry, lock_path: Path) -> None:
        try:
            await self.files.download(model=model, on_progress=self._on_progress)
            self.events.publish(CompletedEvent())
        except asyncio.CancelledError:
            self.events.publish(CancelledEvent())
            raise
        except (ChecksumMismatchError, DownloadFailedError) as error:
            logger.warning("Model download failed for %s: %s", model.id, error.code)
            self._publish_failed(code=error.code, message=error.message)
        except Exception:
            # Background-task boundary: without a terminal event the SSE stream and the UI
            # would wait forever, so any unexpected error still ends the download as failed.
            logger.exception("Unexpected error while downloading model %s", model.id)
            self._publish_failed(code=AppError.code, message=AppError.default_message)
        finally:
            lock_path.unlink(missing_ok=True)
            self.current_model_id = None
            self.task = None

    def _publish_failed(self, *, code: str, message: str) -> None:
        self.events.publish(FailedEvent(data=FailedData(code=code, message=message)))

    def _on_progress(self, *, bytes_downloaded: int, total_bytes: int) -> None:
        self.events.publish(
            ProgressEvent(data=ProgressData(bytes=bytes_downloaded, total=total_bytes))
        )
        if total_bytes > 0 and bytes_downloaded >= total_bytes:
            self.events.publish(VerifyingEvent())

    async def cancel(self, model_id: str) -> None:
        """No-op if nothing is downloading, or a different model id is active."""
        if self.current_model_id != model_id or self.task is None:
            return
        task = self.task
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
