from pathlib import Path

import pytest

from app.errors import NotFoundError
from app.repositories.file_paths import resolve_data_path


def test_resolve_data_path_returns_file_inside_root(tmp_path: Path) -> None:
    root = tmp_path / "root"
    root.mkdir()
    target = root / "a.txt"
    target.write_text(data="hi", encoding="utf-8")
    assert resolve_data_path(root=root, relative="a.txt") == target.resolve()


@pytest.mark.parametrize("relative", ["../secret.txt", "a/../../secret.txt", "/etc/passwd"])
def test_resolve_data_path_rejects_escape_outside_root(tmp_path: Path, relative: str) -> None:
    root = tmp_path / "root"
    root.mkdir()
    (tmp_path / "secret.txt").write_text(data="private", encoding="utf-8")
    with pytest.raises(NotFoundError):
        resolve_data_path(root=root, relative=relative)


def test_resolve_data_path_missing_file_raises_when_must_exist(tmp_path: Path) -> None:
    root = tmp_path / "root"
    root.mkdir()
    with pytest.raises(NotFoundError):
        resolve_data_path(root=root, relative="missing.txt")


def test_resolve_data_path_missing_file_allowed_when_not_must_exist(tmp_path: Path) -> None:
    root = tmp_path / "root"
    root.mkdir()
    path = resolve_data_path(root=root, relative="new.txt", must_exist=False)
    assert path == (root / "new.txt").resolve()


def test_resolve_data_path_wraps_resolution_errors_as_not_found(tmp_path: Path) -> None:
    # A circular symlink makes Path.resolve() raise RuntimeError (not an is_relative_to
    # mismatch): the except clause must still turn it into a NotFoundError, not leak it.
    root = tmp_path / "root"
    root.mkdir()
    loop = root / "loop"
    loop.symlink_to(target=loop)
    with pytest.raises(NotFoundError):
        resolve_data_path(root=root, relative="loop/x")
