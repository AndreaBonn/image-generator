import errno
import json
import shutil
from dataclasses import dataclass
from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path
from typing import Any
from uuid import uuid4

from PIL import Image, PngImagePlugin

from app.errors import DiskFullError

THUMBNAIL_SIZE = 384
METADATA_KEY = "studio_immagini"


@dataclass(frozen=True, kw_only=True)
class SavedImage:
    id: str
    image_path: str
    thumb_path: str
    width: int
    height: int


def encode_images(image: bytes, metadata: dict[str, Any]) -> tuple[bytes, bytes, tuple[int, int]]:
    png, thumbnail = BytesIO(), BytesIO()
    with Image.open(fp=BytesIO(image)) as source:
        info = PngImagePlugin.PngInfo()
        info.add_text(key=METADATA_KEY, value=json.dumps(metadata, ensure_ascii=True))
        source.save(fp=png, format="PNG", pnginfo=info)
        size = source.size
        preview = source.convert(mode="RGB")
        preview.thumbnail(size=(THUMBNAIL_SIZE, THUMBNAIL_SIZE))
        preview.save(fp=thumbnail, format="WEBP")
    return png.getvalue(), thumbnail.getvalue(), size


class ImageRepository:
    def __init__(self, data_dir: Path) -> None:
        self.data_dir = data_dir

    def save(self, image: bytes, metadata: dict[str, Any]) -> SavedImage:
        png, thumbnail, size = encode_images(image=image, metadata=metadata)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        if shutil.disk_usage(path=self.data_dir)[2] < len(png) + len(thumbnail):
            raise DiskFullError()
        image_id = str(uuid4())
        month = datetime.now(tz=UTC).strftime("%Y/%m")
        saved = SavedImage(
            id=image_id,
            image_path=f"images/{month}/{image_id}.png",
            thumb_path=f"thumbs/{image_id}.webp",
            width=size[0],
            height=size[1],
        )
        self._write_pair(saved=saved, png=png, thumbnail=thumbnail)
        return saved

    def _write_pair(self, saved: SavedImage, png: bytes, thumbnail: bytes) -> None:
        paths = [self.data_dir / saved.image_path, self.data_dir / saved.thumb_path]
        try:
            for path, content in zip(paths, (png, thumbnail), strict=True):
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data=content)
        except OSError as error:
            self.remove(saved=saved)
            if error.errno in (errno.ENOSPC, errno.EDQUOT):
                raise DiskFullError() from error
            raise

    def remove(self, saved: SavedImage) -> None:
        (self.data_dir / saved.image_path).unlink(missing_ok=True)
        (self.data_dir / saved.thumb_path).unlink(missing_ok=True)
