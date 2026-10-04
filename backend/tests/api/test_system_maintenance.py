import subprocess
from pathlib import Path
from typing import Any

import pytest
from test_jobs import JobApp
from test_jobs import job_app as job_app

from app.api.v1.jobs import get_engine
from app.engine.fake_engine import FakeEngine
from app.errors import EngineUnavailableError


class StatsEngine(FakeEngine):
    async def system_stats(self) -> dict[str, Any]:
        return {
            "system": {"comfyui_version": "test-version"},
            "devices": [
                {
                    "name": "Test GPU",
                    "type": "cuda",
                    "vram_total": 8 * 1024**3,
                    "vram_free": 3 * 1024**3,
                },
            ],
        }


async def test_system_reports_gpu_models_and_family(
    job_app: JobApp, monkeypatch: pytest.MonkeyPatch
) -> None:
    application, client = job_app
    application.dependency_overrides[get_engine] = lambda: StatsEngine()
    application.state.job_service.runner.family = "sdxl"
    calls = []

    def run(args: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
        calls.append((args, kwargs))
        return subprocess.CompletedProcess(
            args=args,
            returncode=0,
            stdout="123, /usr/bin/render, 64\n124, engine/ComfyUI/main.py, 512\n",
        )

    monkeypatch.setattr(subprocess, "run", run)
    response = await client.get(url="/api/v1/system")
    assert response.status_code == 200
    data = response.json()["data"]
    assert_system_gpu(data=data)
    assert data["loaded_family"] == "sdxl"
    assert data["disk"]["free_gb"] > 0
    assert data["models"] and "license" in data["models"][0]
    assert data["install_command"] == "uv run --script scripts/install_models.py --install"
    assert calls[0][0][0] == "nvidia-smi" and calls[0][1]["timeout"] == 5
    assert not calls[0][1].get("shell", False)


def assert_system_gpu(data: dict[str, Any]) -> None:
    assert data["engine"] == {"status": "ok", "comfyui_version": "test-version"}
    assert data["gpu"] == {
        "name": "Test GPU",
        "vram_total_mb": 8192,
        "vram_free_mb": 3072,
        "other_processes": [{"name": "/usr/bin/render", "used_mb": 64}],
    }


async def test_system_offline_and_missing_nvidia(
    job_app: JobApp, monkeypatch: pytest.MonkeyPatch
) -> None:
    application, client = job_app

    class OfflineEngine(FakeEngine):
        async def system_stats(self) -> dict[str, Any]:
            raise EngineUnavailableError()

    application.dependency_overrides[get_engine] = lambda: OfflineEngine()

    def missing(*args: Any, **kwargs: Any) -> subprocess.CompletedProcess[str]:
        raise FileNotFoundError()

    monkeypatch.setattr(subprocess, "run", missing)
    data = (await client.get(url="/api/v1/system")).json()["data"]
    assert data["engine"]["status"] == "unreachable"
    assert data["gpu"] is None


async def test_clear_output_keeps_symlinks_and_outside_files(
    job_app: JobApp, tmp_path: Path
) -> None:
    application, client = job_app
    output = tmp_path / "output"
    studio = output / "studio"
    (studio / "nested").mkdir(parents=True)
    (studio / "nested" / "image.png").write_bytes(data=b"x" * 1024**2)
    outside = tmp_path / "protected"
    outside.mkdir()
    (outside / "secret").write_bytes(data=b"secret")
    (studio / "link").symlink_to(target=outside, target_is_directory=True)
    (studio / "file-link").symlink_to(target=outside / "secret")
    application.state.settings = application.state.settings.model_copy(
        update={"comfy_output_dir": output}
    )
    response = await client.post(url="/api/v1/maintenance/clear-engine-output")
    assert response.status_code == 200, response.text
    assert response.json()["data"] == {"removed_files": 1, "freed_mb": 1.0}
    assert (outside / "secret").read_bytes() == b"secret"
    assert (studio / "file-link").is_symlink()
    assert (await client.post(url="/api/v1/maintenance/clear-engine-output")).json()["data"][
        "removed_files"
    ] == 0


async def test_clear_output_rejects_symlink_root(job_app: JobApp, tmp_path: Path) -> None:
    application, client = job_app
    output = tmp_path / "output"
    output.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    (output / "studio").symlink_to(target=outside, target_is_directory=True)
    application.state.settings = application.state.settings.model_copy(
        update={"comfy_output_dir": output}
    )
    response = await client.post(url="/api/v1/maintenance/clear-engine-output")
    assert response.status_code == 404
