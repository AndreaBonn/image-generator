from pathlib import Path
from types import ModuleType

import pytest
from migration_support import migration

__all__ = ["migration"]


def test_dry_run_changes_nothing(migration: ModuleType, tmp_path: Path) -> None:
    before = sorted(str(path) for path in tmp_path.rglob("*"))
    assert migration.main(argv=[]) == 0
    assert sorted(str(path) for path in tmp_path.rglob("*")) == before
    assert (tmp_path / "fooocus/models/checkpoints/demo.bin").read_bytes() == b"abc"


def test_same_filesystem_move_and_idempotence(migration: ModuleType, tmp_path: Path) -> None:
    source = tmp_path / "fooocus/models/checkpoints/demo.bin"
    assert source.read_bytes() == b"abc"
    assert migration.main(argv=["--apply"]) == 0
    destination = tmp_path / "models/checkpoints/demo.bin"
    assert destination.read_bytes() == b"abc"
    assert not source.exists()
    first_mtime = destination.stat().st_mtime_ns
    assert migration.main(argv=["--apply"]) == 0
    assert destination.stat().st_mtime_ns == first_mtime


def test_cross_device_copy_retains_source(
    migration: ModuleType, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(migration, "same_filesystem", lambda **kwargs: False)
    assert migration.main(argv=["--apply"]) == 0
    assert (tmp_path / "models/checkpoints/demo.bin").read_bytes() == b"abc"
    assert (tmp_path / "fooocus/models/checkpoints/demo.bin").read_bytes() == b"abc"


@pytest.mark.parametrize("apply", [False, True])
def test_destination_size_mismatch_refused(
    migration: ModuleType, tmp_path: Path, apply: bool
) -> None:
    destination = tmp_path / "models/checkpoints/demo.bin"
    destination.parent.mkdir(parents=True)
    destination.write_bytes(b"existing")
    assert migration.main(argv=["--apply"] if apply else []) == 1
    assert destination.read_bytes() == b"existing"
    assert (tmp_path / "fooocus/models/checkpoints/demo.bin").read_bytes() == b"abc"


def test_styles_copied_and_different_content_refused(migration: ModuleType, tmp_path: Path) -> None:
    assert migration.main(argv=["--apply"]) == 0
    source = tmp_path / "fooocus/sdxl_styles/test.json"
    destination = tmp_path / "data/styles/test.json"
    assert source.read_bytes() == destination.read_bytes()
    destination.write_text("[]", encoding="utf-8")
    assert migration.main(argv=["--apply"]) == 1
    assert destination.read_text() == "[]"
    assert source.read_text() == '[{"name":"Test"}]'


def test_cross_device_bad_hash_not_published(
    migration: ModuleType, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(migration, "same_filesystem", lambda **kwargs: False)
    source = tmp_path / "fooocus/models/checkpoints/demo.bin"
    source.write_bytes(b"bad")
    assert migration.main(argv=["--apply"]) == 1
    assert source.read_bytes() == b"bad"
    assert list((tmp_path / "models/checkpoints").iterdir()) == []


def test_source_missing_reported(migration: ModuleType, tmp_path: Path) -> None:
    (tmp_path / "fooocus/models/checkpoints/demo.bin").unlink()
    assert migration.main(argv=[]) == 1
    assert (tmp_path / "fooocus/sdxl_styles/test.json").is_file()


def test_destination_appearing_before_move_is_preserved(
    migration: ModuleType, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    destination = tmp_path / "models/checkpoints/demo.bin"

    def create_competing_file(source: Path, destination: Path) -> bool:
        destination.parent.mkdir(parents=True)
        destination.write_bytes(b"other-owner")
        return True

    monkeypatch.setattr(migration, "same_filesystem", create_competing_file)
    assert migration.main(argv=["--apply"]) == 1
    assert destination.read_bytes() == b"other-owner"
    assert (tmp_path / "fooocus/models/checkpoints/demo.bin").read_bytes() == b"abc"


def test_wrong_source_size_is_not_moved(migration: ModuleType, tmp_path: Path) -> None:
    source = tmp_path / "fooocus/models/checkpoints/demo.bin"
    source.write_bytes(b"truncated")
    assert migration.main(argv=["--apply"]) == 1
    assert source.read_bytes() == b"truncated"
    assert not (tmp_path / "models/checkpoints/demo.bin").exists()


def test_dangling_destination_is_not_replaced(migration: ModuleType, tmp_path: Path) -> None:
    destination = tmp_path / "models/checkpoints/demo.bin"
    destination.parent.mkdir(parents=True)
    destination.symlink_to(target=tmp_path / "missing-target")
    assert migration.main(argv=["--apply"]) == 1
    assert destination.is_symlink()
    assert (tmp_path / "fooocus/models/checkpoints/demo.bin").read_bytes() == b"abc"


def test_failed_rename_cleans_reservation(
    migration: ModuleType, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    source = tmp_path / "fooocus/models/checkpoints/demo.bin"
    destination = tmp_path / "output.bin"

    def fail_rename(*, src: Path, dst: Path) -> None:
        raise OSError("simulated rename failure")

    monkeypatch.setattr(migration.os, "rename", fail_rename)
    with pytest.raises(OSError, match="simulated"):
        migration.publish_file(source=source, destination=destination)
    assert source.read_bytes() == b"abc"
    assert not destination.exists()


def test_symlinked_source_is_copied_not_moved(migration: ModuleType, tmp_path: Path) -> None:
    real = tmp_path / "shared/demo.bin"
    real.parent.mkdir()
    source = tmp_path / "fooocus/models/checkpoints/demo.bin"
    source.rename(real)
    source.symlink_to(real)

    assert migration.main(argv=["--apply"]) == 0

    destination = tmp_path / "models/checkpoints/demo.bin"
    assert not destination.is_symlink()
    assert destination.read_bytes() == b"abc"
    assert source.is_symlink() and real.read_bytes() == b"abc"


def test_failed_rename_preserves_destination_replaced_by_another_process(
    migration: ModuleType, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    source = tmp_path / "fooocus/models/checkpoints/demo.bin"
    destination = tmp_path / "output.bin"

    def fail_rename_after_replacement(*, src: Path, dst: Path) -> None:
        # Simulates another process winning the race after the reservation
        # was created: it replaces the reserved file with its own content
        # before our os.rename fails.
        dst.unlink()
        dst.write_bytes(b"other-owner")
        raise OSError("simulated rename failure, destination replaced")

    monkeypatch.setattr(migration.os, "rename", fail_rename_after_replacement)
    with pytest.raises(OSError, match="simulated"):
        migration.publish_file(source=source, destination=destination)
    assert destination.read_bytes() == b"other-owner"
    assert source.read_bytes() == b"abc"


def test_migrate_styles_missing_source_directory_reports_error(
    migration: ModuleType, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    paths = migration.Paths(
        fooocus_dir=tmp_path / "no-such-fooocus",
        models_dir=tmp_path / "models",
        styles_dir=tmp_path / "data" / "styles",
    )
    assert migration.migrate_styles(paths=paths, apply=False) == 1
    assert "cartella stili sorgente mancante" in capsys.readouterr().out


def test_orphan_temporary_files_from_an_interrupted_copy_are_removed(
    migration: ModuleType, tmp_path: Path
) -> None:
    folder = tmp_path / "models/checkpoints"
    folder.mkdir(parents=True)
    orphan = folder / f"{migration.TEMP_PREFIX}leftover"
    orphan.write_bytes(b"partial")
    unrelated = folder / "keep.bin"
    unrelated.write_bytes(b"user file")

    assert migration.main(argv=["--apply"]) == 0

    assert not orphan.exists()
    assert unrelated.read_bytes() == b"user file"
    assert (folder / "demo.bin").read_bytes() == b"abc"
