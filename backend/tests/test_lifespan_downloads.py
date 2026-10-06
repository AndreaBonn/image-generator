import logging
from pathlib import Path

import pytest

from app.config import Settings
from app.lifespan import initialize_resources


def test_stale_downloads_removed_other_model_dirs_untouched(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    models_dir = tmp_path / "models"
    staging = models_dir / ".downloads"
    staging.mkdir(parents=True)
    (staging / "ultrasharp_4x.part").write_bytes(b"partial")
    (staging / "ultrasharp_4x.lock").write_bytes(b"")
    checkpoints = models_dir / "checkpoints"
    checkpoints.mkdir()
    (checkpoints / "juggernaut.safetensors").write_bytes(b"keep me")

    config = Settings(_env_file=None, data_dir=tmp_path / "data", models_dir=models_dir)
    with caplog.at_level(logging.WARNING):
        resources = initialize_resources(config=config)
    try:
        assert list(staging.iterdir()) == []
        assert (checkpoints / "juggernaut.safetensors").read_bytes() == b"keep me"
        assert "ultrasharp_4x.part" in caplog.text
    finally:
        resources.repository.database.close()


def test_no_downloads_dir_is_a_noop(tmp_path: Path) -> None:
    config = Settings(_env_file=None, data_dir=tmp_path / "data", models_dir=tmp_path / "models")
    resources = initialize_resources(config=config)
    resources.repository.database.close()
