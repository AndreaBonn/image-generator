from pathlib import Path

import pytest

from app.repositories.asset_repository import AssetRepository, atomic_write_bytes, preview_id


def test_preview_id_is_16_hex_chars_and_deterministic() -> None:
    first = preview_id(style_name="Photographic")
    second = preview_id(style_name="Photographic")
    assert first == second
    assert len(first) == 16
    assert all(character in "0123456789abcdef" for character in first)


def test_preview_id_differs_per_style_name() -> None:
    assert preview_id(style_name="Photographic") != preview_id(style_name="Cinematic")


def test_exists_false_before_save_true_after(tmp_path: Path) -> None:
    repository = AssetRepository(data_dir=tmp_path)
    assert repository.exists(style_name="Photographic") is False
    repository.save(style_name="Photographic", content=b"fake-webp-bytes")
    assert repository.exists(style_name="Photographic") is True


def test_save_writes_atomically_leaving_no_tmp_file(tmp_path: Path) -> None:
    repository = AssetRepository(data_dir=tmp_path)
    repository.save(style_name="Photographic", content=b"fake-webp-bytes")
    path = repository.path_for(style_name="Photographic")
    assert path.read_bytes() == b"fake-webp-bytes"
    leftovers = [entry for entry in path.parent.iterdir() if entry != path]
    assert leftovers == []


def test_path_for_traversal_style_name_stays_inside_previews_dir(tmp_path: Path) -> None:
    repository = AssetRepository(data_dir=tmp_path)
    path = repository.path_for(style_name="../../etc/passwd")
    assert path.is_relative_to(repository.previews_dir)
    assert path.parent == repository.previews_dir


def test_lookup_returns_path_for_valid_existing_id(tmp_path: Path) -> None:
    repository = AssetRepository(data_dir=tmp_path)
    repository.save(style_name="Photographic", content=b"fake-webp-bytes")
    asset_id = preview_id(style_name="Photographic")
    assert repository.lookup(asset_id=asset_id) == repository.path_for(style_name="Photographic")


def test_lookup_rejects_id_not_matching_16_hex(tmp_path: Path) -> None:
    from app.errors import NotFoundError

    repository = AssetRepository(data_dir=tmp_path)
    for bad_id in ("../../etc/passwd", "not-hex!!!!!!!!!", "ab", "a" * 17, "A" * 16):
        with pytest.raises(NotFoundError):
            repository.lookup(asset_id=bad_id)


def test_lookup_rejects_valid_shaped_id_with_no_file(tmp_path: Path) -> None:
    from app.errors import NotFoundError

    repository = AssetRepository(data_dir=tmp_path)
    with pytest.raises(NotFoundError):
        repository.lookup(asset_id="0123456789abcdef")


def test_atomic_writes_use_a_distinct_temporary_file_each_time(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    sources: list[str] = []
    original_replace = Path.replace

    def recording_replace(self: Path, target: Path) -> Path:
        sources.append(self.name)
        return original_replace(self, target)

    monkeypatch.setattr(Path, "replace", recording_replace)
    target = tmp_path / "examples" / "manifest.json"

    atomic_write_bytes(path=target, content=b"first")
    atomic_write_bytes(path=target, content=b"second")

    assert len(set(sources)) == 2
    assert target.read_bytes() == b"second"
    assert sorted(path.name for path in target.parent.iterdir()) == ["manifest.json"]
