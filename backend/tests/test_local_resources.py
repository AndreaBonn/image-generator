import logging
from pathlib import Path

import pytest

from app.config import Settings
from app.lifespan import initialize_resources
from app.repositories.style_repository import load_styles
from app.services.system_service import model_status
from app.services.task_catalog import load_catalog

MIGRATE = "uv run --script scripts/migrate_from_fooocus.py --apply"


def test_styles_default_follows_data_dir_and_override(tmp_path: Path) -> None:
    config = Settings(_env_file=None, data_dir=tmp_path)
    assert config.styles_dir == tmp_path / "styles"
    assert "fooocus_dir" not in Settings.model_fields
    custom = Settings(_env_file=None, data_dir=tmp_path, styles_dir=tmp_path / "custom")
    assert custom.styles_dir == tmp_path / "custom"


@pytest.mark.parametrize("exists", [False, True])
def test_empty_styles_warn_with_recovery(
    tmp_path: Path, caplog: pytest.LogCaptureFixture, exists: bool
) -> None:
    directory = tmp_path / "styles"
    if exists:
        directory.mkdir()
    with caplog.at_level(logging.WARNING):
        assert load_styles(directory=directory) == ()
    assert str(directory) in caplog.text
    assert "run scripts/migrate_from_fooocus.py" in caplog.text
    directory.mkdir(exist_ok=True)
    (directory / "test.json").write_text('[{"name":"Test"}]', encoding="utf-8")
    assert load_styles(directory=directory)[0].name == "Test"


def test_lifespan_reads_own_styles(tmp_path: Path) -> None:
    directory = tmp_path / "styles"
    directory.mkdir()
    (directory / "test.json").write_text('[{"name":"Test"}]', encoding="utf-8")
    config = Settings(_env_file=None, data_dir=tmp_path, styles_dir=directory)
    resources = initialize_resources(config=config)
    try:
        assert resources.styles.search_styles()[0].name == "Test"
    finally:
        resources.repository.database.close()


def test_local_models_use_own_path_and_migration_hint(tmp_path: Path) -> None:
    catalog = load_catalog(settings=Settings(_env_file=None, models_dir=tmp_path))
    model = catalog.models["juggernaut_xl_v8"]
    assert model.source == "local"
    result = model_status(model=model, catalog=catalog)
    assert result["status"] == "missing"
    assert result["install_command"] == MIGRATE
    task = next(task for task in catalog.tasks if task.id == "qualita")
    assert MIGRATE in (catalog.unavailable_reason(task=task) or "")
    path = tmp_path / model.folder / model.filename
    path.parent.mkdir()
    path.write_bytes(b"test")
    assert catalog.repository.has_model(model=model)
    assert model_status(model=model, catalog=catalog)["status"] == "installed"
