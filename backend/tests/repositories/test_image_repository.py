import errno
import json
from pathlib import Path
from unittest.mock import patch

import pytest
from PIL import Image, PngImagePlugin

from app.engine.fake_engine import render_image
from app.errors import DiskFullError
from app.repositories.image_repository import ImageRepository


def test_save_png_metadata_relative_paths_and_webp_thumbnail(tmp_path: Path) -> None:
    repository = ImageRepository(data_dir=tmp_path)
    saved = repository.save(
        image=render_image(width=768, height=512, seed=42), metadata={"seed": 42, "prompt": "città"}
    )
    assert not Path(saved.image_path).is_absolute()
    assert not Path(saved.thumb_path).is_absolute()
    assert saved.image_path.startswith("images/") and saved.thumb_path.startswith("thumbs/")
    with Image.open(tmp_path / saved.image_path) as image:
        assert isinstance(image, PngImagePlugin.PngImageFile)
        assert json.loads(image.text["studio_immagini"]) == {"seed": 42, "prompt": "città"}
        assert image.size == (768, 512)
    with Image.open(tmp_path / saved.thumb_path) as thumb:
        assert thumb.format == "WEBP"
        assert thumb.size == (384, 256)
    repository.remove(saved=saved)
    assert list(tmp_path.rglob("*.png")) == []


@pytest.mark.parametrize("race", [False, True])
def test_save_disk_full_leaves_no_partial_files(tmp_path: Path, race: bool) -> None:
    repository = ImageRepository(data_dir=tmp_path)
    image = render_image(width=32, height=32, seed=1)
    target = (
        "pathlib.Path.write_bytes"
        if race
        else "app.repositories.image_repository.shutil.disk_usage"
    )
    failure = (
        patch(target=target, side_effect=OSError(errno.ENOSPC, "full"))
        if race
        else patch(target=target, return_value=(0, 0, 0))
    )
    with failure, pytest.raises(DiskFullError):
        repository.save(image=image, metadata={"seed": 1})
    assert list(tmp_path.rglob("*.png")) == []
    assert list(tmp_path.rglob("*.webp")) == []
    saved = repository.save(image=image, metadata={"seed": 1})
    assert (tmp_path / saved.image_path).is_file()
