from pathlib import Path

import pytest
from install_models_support import install_models, make_entry

COMMAND = "uv run --script scripts/migrate_from_fooocus.py --apply"


def test_local_status_and_listing(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    paths = install_models.Paths(models_dir=tmp_path)
    entry = make_entry(source="local")
    assert install_models.model_status(entry=entry, paths=paths) == "missing"
    install_models.print_listing(entries=[entry], paths=paths)
    assert COMMAND in capsys.readouterr().out
    target = tmp_path / entry.folder / entry.filename
    target.parent.mkdir()
    target.write_bytes(b"local")
    assert install_models.model_status(entry=entry, paths=paths) == "installed"


def test_local_download_and_remove_refuse(tmp_path: Path) -> None:
    paths = install_models.Paths(models_dir=tmp_path)
    entry = make_entry(source="local")
    with pytest.raises(SystemExit, match="modello locale.*migra"):
        install_models.download(entry=entry, paths=paths, min_free_gb=5)
    target = tmp_path / entry.folder / entry.filename
    target.parent.mkdir()
    target.write_bytes(b"user-provided")
    with pytest.raises(SystemExit, match="modello locale.*rimozione"):
        install_models.remove(entry=entry, paths=paths, assume_yes=True)
    assert target.read_bytes() == b"user-provided"
