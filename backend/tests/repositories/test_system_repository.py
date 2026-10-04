import subprocess
from typing import Any

import pytest

from app.repositories.system_repository import gpu_processes, parse_processes


def test_parse_processes_skips_invalid_and_engine_rows() -> None:
    output = (
        "1, render, 20\n2, engine/ComfyUI/main.py, 300\n3, missing, N/A\n4, negative, -1\ninvalid\n"
    )
    assert parse_processes(output=output) == [{"name": "render", "used_mb": 20}]


@pytest.mark.parametrize(
    "error",
    [
        FileNotFoundError(),
        subprocess.TimeoutExpired(cmd="nvidia-smi", timeout=5),
        subprocess.CalledProcessError(returncode=1, cmd="nvidia-smi"),
    ],
)
def test_gpu_processes_returns_empty_on_boundary_failure(
    monkeypatch: pytest.MonkeyPatch, error: Exception
) -> None:
    def run(**kwargs: Any) -> subprocess.CompletedProcess[str]:
        raise error

    monkeypatch.setattr(subprocess, "run", run)
    assert gpu_processes() == []
