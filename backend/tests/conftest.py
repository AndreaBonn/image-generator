from pathlib import Path

import pytest

import app.main
from app.config import settings


@pytest.fixture(autouse=True)
def isolate_default_storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        app.main,
        "settings",
        settings.model_copy(
            update={"data_dir": tmp_path / "data", "fooocus_dir": tmp_path / "fooocus"}
        ),
    )
