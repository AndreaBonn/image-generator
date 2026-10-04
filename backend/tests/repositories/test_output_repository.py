from pathlib import Path

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
