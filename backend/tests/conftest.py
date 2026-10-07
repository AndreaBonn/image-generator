from pathlib import Path

import pytest

import app.main
from app.config import REPO_ROOT, Settings, settings


@pytest.fixture(autouse=True)
def isolate_default_storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        app.main,
        "settings",
        settings.model_copy(
            update={"data_dir": tmp_path / "data", "styles_dir": tmp_path / "styles"}
        ),
    )


@pytest.fixture
def catalog_settings(tmp_path: Path) -> Settings:
    config_dir = tmp_path / "config"
    config_dir.mkdir()
    (config_dir / "tasks.yaml").write_text(
        (REPO_ROOT / "config/tasks.yaml").read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    (config_dir / "models.yaml").write_text(
        (REPO_ROOT / "config/models.yaml").read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    return Settings(
        config_dir=config_dir,
        workflows_dir=REPO_ROOT / "workflows",
        styles_dir=tmp_path / "styles",
        models_dir=tmp_path / "models",
    )
