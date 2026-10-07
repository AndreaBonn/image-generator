from pathlib import Path
from types import ModuleType

import pytest
import yaml
from migration_support import migration

__all__ = ["migration"]


def test_migrate_model_rejects_absolute_folder(migration: ModuleType, tmp_path: Path) -> None:
    paths = migration.Paths(
        fooocus_dir=tmp_path / "fooocus",
        models_dir=tmp_path / "models",
        styles_dir=tmp_path / "data" / "styles",
    )
    entry = {"folder": "/etc", "filename": "passwd", "size_bytes": 1, "sha256": "irrelevant"}
    with pytest.raises(ValueError, match="non relativo"):
        migration.migrate_model(entry=entry, paths=paths, apply=True)
    assert not (tmp_path / "models").exists()


def test_migrate_model_rejects_parent_traversal_in_filename(
    migration: ModuleType, tmp_path: Path
) -> None:
    paths = migration.Paths(
        fooocus_dir=tmp_path / "fooocus",
        models_dir=tmp_path / "models",
        styles_dir=tmp_path / "data" / "styles",
    )
    entry = {
        "folder": "checkpoints",
        "filename": "../../etc/passwd",
        "size_bytes": 1,
        "sha256": "irrelevant",
    }
    with pytest.raises(ValueError, match="non relativo"):
        migration.migrate_model(entry=entry, paths=paths, apply=True)
    assert not (tmp_path / "models").exists()


def test_migrate_models_counts_path_traversal_as_error(
    migration: ModuleType, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    registry_path = tmp_path / "models.yaml"
    entries = [
        {
            "id": "bad-path",
            "source": "local",
            "fooocus_migratable": True,
            "folder": "checkpoints",
            "filename": "../../etc/passwd",
            "size_bytes": 1,
            "sha256": "irrelevant",
        }
    ]
    registry_path.write_text(yaml.safe_dump({"models": entries}), encoding="utf-8")
    paths = migration.Paths(
        fooocus_dir=tmp_path / "fooocus",
        models_dir=tmp_path / "models",
        styles_dir=tmp_path / "data" / "styles",
    )
    assert migration.migrate_models(paths=paths, apply=False) == 1
    assert "percorso modello non relativo" in capsys.readouterr().out


def test_migrate_models_skips_non_local_source(migration: ModuleType, tmp_path: Path) -> None:
    registry_path = tmp_path / "models.yaml"
    entries = [
        {
            "id": "remote-model",
            "source": "remote",
            "folder": "checkpoints",
            "filename": "missing.bin",
            "size_bytes": 1,
            "sha256": "irrelevant",
        }
    ]
    registry_path.write_text(yaml.safe_dump({"models": entries}), encoding="utf-8")
    paths = migration.Paths(
        fooocus_dir=tmp_path / "fooocus",
        models_dir=tmp_path / "models",
        styles_dir=tmp_path / "data" / "styles",
    )
    assert migration.migrate_models(paths=paths, apply=False) == 0


def test_migrate_models_selects_by_fooocus_migratable_not_source(
    migration: ModuleType, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Four huggingface-sourced entries marked fooocus_migratable: true must still
    be planned by the migration shortcut, mirroring the post-T002 registry where no
    entry has source: local anymore."""
    registry_path = tmp_path / "models.yaml"
    migratable_ids = ["model-a", "model-b", "model-c", "model-d"]
    entries = [
        {
            "id": model_id,
            "source": "huggingface",
            "fooocus_migratable": True,
            "folder": "checkpoints",
            "filename": f"{model_id}.bin",
            "size_bytes": 1,
            "sha256": "irrelevant",
        }
        for model_id in migratable_ids
    ] + [
        {
            "id": "not-migratable",
            "source": "huggingface",
            "fooocus_migratable": False,
            "folder": "checkpoints",
            "filename": "not-migratable.bin",
            "size_bytes": 1,
            "sha256": "irrelevant",
        }
    ]
    registry_path.write_text(yaml.safe_dump({"models": entries}), encoding="utf-8")
    paths = migration.Paths(
        fooocus_dir=tmp_path / "fooocus",
        models_dir=tmp_path / "models",
        styles_dir=tmp_path / "data" / "styles",
    )
    planned: list[str] = []
    monkeypatch.setattr(
        migration,
        "migrate_model",
        lambda entry, paths, apply: planned.append(entry["id"]),
    )
    monkeypatch.setattr(migration, "REGISTRY_PATH", registry_path)

    errors = migration.migrate_models(paths=paths, apply=False)

    assert errors == 0
    assert sorted(planned) == sorted(migratable_ids)
    assert "not-migratable" not in planned


def test_main_reports_global_error_without_traceback(
    migration: ModuleType, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    (tmp_path / "models.yaml").write_text("not: [valid", encoding="utf-8")
    assert migration.main(argv=[]) == 1
    captured = capsys.readouterr()
    assert "Errore:" in captured.out
    assert "Traceback" not in captured.out
