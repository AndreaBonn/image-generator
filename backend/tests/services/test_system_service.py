import subprocess
from pathlib import Path
from typing import Any

import pytest

from app.config import Settings
from app.services.system_service import gpu_status, model_status
from app.services.task_catalog import load_catalog


def test_model_status_covers_downloaded_and_local_models(tmp_path: Path) -> None:
    config = Settings(
        data_dir=tmp_path, models_dir=tmp_path / "models", styles_dir=tmp_path / "styles"
    )
    catalog = load_catalog(settings=config)
    for model_id, missing, installed in [
        ("ultrasharp_4x", "missing", "installed"),
        ("juggernaut_xl_v8", "missing", "installed"),
    ]:
        model = catalog.models[model_id]
        assert model_status(model=model, catalog=catalog)["status"] == missing
        root = config.models_dir
        path = root / model.folder / model.filename
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data=b"weights")
        result = model_status(model=model, catalog=catalog)
        assert result["status"] == installed and result["size_gb"] > 0
        assert result["license"] == model.license and result["enabled"] == model.enabled
    assert model_status(model=catalog.models["zimage_turbo"], catalog=catalog)["enabled"] is False


def test_gpu_status_none_without_a_gpu_device(monkeypatch: pytest.MonkeyPatch) -> None:
    def no_nvidia_smi(args: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
        raise FileNotFoundError()

    monkeypatch.setattr(subprocess, "run", no_nvidia_smi)
    assert gpu_status(stats={"devices": [{"type": "cpu", "name": "CPU"}]}) is None
    assert gpu_status(stats={"devices": []}) is None
    assert gpu_status(stats={}) is None
    present = gpu_status(
        stats={
            "devices": [
                {"type": "cuda", "name": "GPU", "vram_total": 1024**3, "vram_free": 512 * 1024**2}
            ]
        }
    )
    assert present == {
        "name": "GPU",
        "vram_total_mb": 1024.0,
        "vram_free_mb": 512.0,
        "other_processes": [],
    }
