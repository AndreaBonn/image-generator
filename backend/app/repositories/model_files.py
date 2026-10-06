import asyncio
import hashlib
from pathlib import Path
from typing import Protocol

import httpx

from app.config import Settings, settings
from app.errors import ChecksumMismatchError, DownloadFailedError
from app.repositories.catalog_repository import ModelEntry
from app.services.model_space import digest_matches, staging_filename

HF_RESOLVE_TEMPLATE = "https://huggingface.co/{repo}/resolve/main/{repo_path}"
# 4 MiB chunks: each hashlib.update() call is bounded and fast, so hashing inline in this
# coroutine (no asyncio.to_thread) does not starve the event loop between network reads.
CHUNK_BYTES = 4 * 1024 * 1024
MAX_REDIRECTS = 5
STAGING_DIRNAME = ".downloads"


class ProgressCallback(Protocol):
    def __call__(self, *, bytes_downloaded: int, total_bytes: int) -> None: ...


def download_url(*, model: ModelEntry) -> str:
    """Resolve the Hugging Face download URL for a model from its registry entry."""
    if not (model.repo and model.repo_path):
        raise DownloadFailedError(
            message=f"Il modello {model.id} non ha repo e repo_path nel registro."
        )
    return HF_RESOLVE_TEMPLATE.format(repo=model.repo, repo_path=model.repo_path)


class ModelFilesRepository:
    def __init__(self, http: httpx.AsyncClient, config: Settings = settings) -> None:
        self.http = http
        self.config = config

    def staging_dir(self) -> Path:
        path = self.config.models_dir / STAGING_DIRNAME
        path.mkdir(parents=True, exist_ok=True)
        return path

    def destination(self, *, model: ModelEntry) -> Path:
        """Final location of the model file, resolved only from the registry entry."""
        return self.config.models_dir / model.folder / model.filename

    async def _open_stream(self, *, url: str) -> httpx.Response:
        current_url = url
        for _ in range(MAX_REDIRECTS + 1):
            request = self.http.build_request(method="GET", url=current_url)
            try:
                response = await self.http.send(request=request, stream=True)
            except httpx.RequestError as error:
                raise DownloadFailedError() from error
            if response.is_redirect:
                target = httpx.URL(response.headers.get("location", ""))
                await response.aclose()
                if target.scheme != "https":
                    raise DownloadFailedError(
                        message="Il server ha rifiutato un redirect non sicuro (non https)."
                    )
                current_url = str(target)
                continue
            if not response.is_success:
                await response.aclose()
                raise DownloadFailedError()
            return response
        raise DownloadFailedError(message="Troppi redirect durante il download del modello.")

    async def download(self, *, model: ModelEntry, on_progress: ProgressCallback) -> Path:
        """Stream the model into staging, verify its sha256, then move it atomically.

        The partial file is removed from staging on any failure (network error, non-2xx
        status, checksum mismatch, or cancellation). Raises DownloadFailedError or
        ChecksumMismatchError; re-raises asyncio.CancelledError after cleanup so the
        caller (a cancelled asyncio.Task) observes the cancellation as usual.
        """
        staging_path = self.staging_dir() / staging_filename(model_id=model.id)
        response = await self._open_stream(url=download_url(model=model))
        total_bytes = int(response.headers.get("content-length") or model.size_bytes)
        digest = hashlib.sha256()
        bytes_downloaded = 0
        try:
            with staging_path.open(mode="wb") as handle:
                async for chunk in response.aiter_bytes(CHUNK_BYTES):
                    handle.write(chunk)
                    digest.update(chunk)
                    bytes_downloaded += len(chunk)
                    on_progress(bytes_downloaded=bytes_downloaded, total_bytes=total_bytes)
        except httpx.RequestError as error:
            staging_path.unlink(missing_ok=True)
            raise DownloadFailedError() from error
        except OSError as error:
            staging_path.unlink(missing_ok=True)
            raise DownloadFailedError(
                message="Errore di scrittura su disco durante il download del modello."
            ) from error
        except asyncio.CancelledError:
            staging_path.unlink(missing_ok=True)
            raise
        finally:
            await response.aclose()
        if not digest_matches(actual=digest.hexdigest(), expected=model.sha256 or ""):
            staging_path.unlink(missing_ok=True)
            raise ChecksumMismatchError()
        destination = self.destination(model=model)
        destination.parent.mkdir(parents=True, exist_ok=True)
        staging_path.replace(destination)
        return destination
