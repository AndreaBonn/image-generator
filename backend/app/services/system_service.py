import asyncio
import shutil
from typing import Any

from app.config import Settings
from app.engine.types import EngineClient
from app.errors import EngineUnavailableError
from app.repositories.catalog_repository import ModelEntry
from app.repositories.system_repository import gpu_processes
from app.services.task_catalog import INSTALL_COMMAND, TaskCatalog, model_install_hint

BYTES_PER_MB = 1024**2
BYTES_PER_GB = 1024**3


def model_status(model: ModelEntry, catalog: TaskCatalog) -> dict[str, Any]:
    config = catalog.repository.settings
    path = config.models_dir / model.folder / model.filename
    installed = path.is_file()
    status = "installed" if installed else "missing"
    size = model.size_bytes or (path.stat().st_size if installed else 0)
    return {
        "id": model.id,
        "label": model.label,
        "family": model.family,
        "status": status,
        "size_gb": size / BYTES_PER_GB,
        "enabled": model.enabled,
        "license": model.license,
        "install_command": model_install_hint(model=model),
        "manual_install": model.manual_install,
    }


def gpu_status(stats: dict[str, Any]) -> dict[str, Any] | None:
    device = next(
        (device for device in stats.get("devices", []) if device.get("type") != "cpu"), None
    )
    if device is None:
        return None
    return {
        "name": device["name"],
        "vram_total_mb": device["vram_total"] / BYTES_PER_MB,
        "vram_free_mb": device["vram_free"] / BYTES_PER_MB,
        "other_processes": gpu_processes(),
    }


class SystemService:
    def __init__(self, config: Settings, catalog: TaskCatalog) -> None:
        self.config = config
        self.catalog = catalog

    async def status(self, engine: EngineClient, loaded_family: str | None) -> dict[str, Any]:
        try:
            stats = await engine.system_stats()
        except EngineUnavailableError:
            stats = None
        return await asyncio.to_thread(self.snapshot, stats=stats, loaded_family=loaded_family)

    def snapshot(self, stats: dict[str, Any] | None, loaded_family: str | None) -> dict[str, Any]:
        return {
            "engine": {
                "status": "ok" if stats is not None else "unreachable",
                "comfyui_version": stats.get("system", {}).get("comfyui_version")
                if stats
                else None,
            },
            "gpu": gpu_status(stats=stats) if stats is not None else None,
            "disk": {
                "free_gb": shutil.disk_usage(path=self.config.data_dir).free / BYTES_PER_GB,
                "min_free_gb": self.config.min_free_disk_gb,
            },
            "loaded_family": loaded_family,
            "models": [
                model_status(model=model, catalog=self.catalog)
                for model in self.catalog.models.values()
            ],
            "install_command": INSTALL_COMMAND,
        }
