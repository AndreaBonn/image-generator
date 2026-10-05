from pathlib import Path

import pytest

from app.errors import NotFoundError
from app.repositories.output_repository import clear_engine_output


def test_clear_engine_output_missing_studio_subdirectory_returns_zero_counts(
    tmp_path: Path,
) -> None:
    output_dir = tmp_path / "output"
    output_dir.mkdir()
    assert clear_engine_output(output_dir=output_dir) == {"removed_files": 0, "freed_mb": 0.0}


def test_clear_engine_output_removes_files_when_studio_exists(tmp_path: Path) -> None:
    output_dir = tmp_path / "output"
    studio = output_dir / "studio"
    studio.mkdir(parents=True)
    (studio / "image.png").write_bytes(data=b"x" * 1024**2)
    result = clear_engine_output(output_dir=output_dir)
    assert result == {"removed_files": 1, "freed_mb": 1.0}
    assert studio.is_dir()
    assert list(studio.iterdir()) == []


def test_clear_engine_output_external_studio_symlink_raises_and_preserves_file(
    tmp_path: Path,
) -> None:
    output_dir = tmp_path / "output"
    output_dir.mkdir()
    external_dir = tmp_path / "external"
    external_dir.mkdir()
    external_file = external_dir / "image.png"
    external_file.write_bytes(data=b"external image")
    (output_dir / "studio").symlink_to(target=external_dir, target_is_directory=True)

    with pytest.raises(NotFoundError):
        clear_engine_output(output_dir=output_dir)

    assert external_file.is_file()
    assert external_file.read_bytes() == b"external image"


def test_clear_engine_output_nested_files_aggregates_counts_and_preserves_directories(
    tmp_path: Path,
) -> None:
    output_dir = tmp_path / "output"
    studio = output_dir / "studio"
    year = studio / "2026"
    month = year / "01"
    month.mkdir(parents=True)
    (studio / "preview.png").write_bytes(data=b"x" * 524288)
    (year / "cover.png").write_bytes(data=b"y" * 1048576)
    (month / "image.png").write_bytes(data=b"z" * 1572864)

    result = clear_engine_output(output_dir=output_dir)

    assert result == {"removed_files": 3, "freed_mb": 3.0}
    assert studio.is_dir()
    assert year.is_dir()
    assert month.is_dir()
    assert list(studio.iterdir()) == [year]
    assert list(year.iterdir()) == [month]
    assert list(month.iterdir()) == []
