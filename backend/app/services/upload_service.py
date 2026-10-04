import errno
import json
import logging
from datetime import timedelta
from io import BytesIO
from pathlib import Path
from typing import BinaryIO, Literal
from uuid import uuid4

from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import ValidationError as RecipeValidationError

from app.errors import DiskFullError, NotFoundError, ValidationError
from app.models.records import UploadRecord, utc_now
from app.models.upload import UploadRecipe, UploadResult
from app.repositories.file_paths import resolve_data_path
from app.repositories.image_repository import METADATA_KEY
from app.repositories.upload_repository import UploadRepository

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_UPLOAD_SIDE = 4096
MAX_RECIPE_BYTES = 64 * 1024
UPLOAD_RETENTION_DAYS = 7
ALLOWED_FORMATS = frozenset({"PNG", "JPEG", "WEBP"})
logger = logging.getLogger(__name__)


FLATTEN_BACKGROUND = (255, 255, 255)


def to_rgb(image: Image.Image) -> Image.Image:
    """Apply EXIF orientation, then flatten any transparency on white instead of dropping alpha."""
    oriented = ImageOps.exif_transpose(image)
    has_alpha = oriented.mode in ("RGBA", "LA") or "transparency" in oriented.info
    if not has_alpha:
        return oriented.convert(mode="RGB")
    rgba = oriented.convert(mode="RGBA")
    flattened = Image.new(mode="RGB", size=rgba.size, color=FLATTEN_BACKGROUND)
    flattened.paste(im=rgba, mask=rgba.getchannel(channel="A"))
    return flattened


def invalid_upload(message: str) -> ValidationError:
    return ValidationError(details=[{"field": "file", "message": message}])


def decode_upload(content: BinaryIO) -> Image.Image:
    image, _ = decode_upload_source(content=content)
    return image


def parse_recipe(raw: object) -> UploadRecipe | None:
    if raw is None:
        return None
    try:
        if not isinstance(raw, str) or len(raw.encode(encoding="utf-8")) > MAX_RECIPE_BYTES:
            logger.debug("Ignoring upload recipe: invalid text or size exceeds limit")
            return None
        return UploadRecipe.model_validate(obj=json.loads(s=raw))
    except (ValueError, RecipeValidationError, RecursionError) as error:
        logger.debug("Ignoring invalid upload recipe: %s", type(error).__name__)
        return None


def decode_upload_source(content: BinaryIO) -> tuple[Image.Image, object]:
    content.seek(0, 2)
    if content.tell() > MAX_UPLOAD_BYTES:
        raise invalid_upload(message="Il file supera il limite di 20 MB.")
    content.seek(0)
    try:
        with Image.open(fp=content) as source:
            if source.format not in ALLOWED_FORMATS:
                raise invalid_upload(message="Sono ammesse solo immagini PNG, JPEG e WebP.")
            if max(source.size) > MAX_UPLOAD_SIDE:
                raise invalid_upload(message="Ogni lato deve essere al massimo di 4096 pixel.")
            source.load()
            raw = source.info.get(METADATA_KEY) if source.format == "PNG" else None
            return to_rgb(image=source), raw
    except (OSError, ValueError, UnidentifiedImageError, Image.DecompressionBombError) as error:
        raise invalid_upload(message="Il file non contiene un'immagine valida.") from error


class UploadService:
    def __init__(self, repository: UploadRepository, data_dir: Path) -> None:
        self.repository = repository
        self.data_dir = data_dir

    def save(self, content: BinaryIO, kind: Literal["image", "mask"]) -> UploadResult:
        image, raw = decode_upload_source(content=content)
        recipe = parse_recipe(raw=raw) if kind == "image" else None
        upload_id = str(uuid4())
        relative = f"uploads/{upload_id}.png"
        path = resolve_data_path(root=self.data_dir, relative=relative, must_exist=False)
        record = UploadRecord(
            id=upload_id, kind=kind, path=relative, width=image.width, height=image.height
        )
        output = BytesIO()
        image.save(fp=output, format="PNG")
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data=output.getvalue())
            self.repository.add(record=record)
        except Exception as error:
            path.unlink(missing_ok=True)
            if isinstance(error, OSError) and error.errno in (errno.ENOSPC, errno.EDQUOT):
                raise DiskFullError() from error
            raise
        return UploadResult(record=record, recipe=recipe)

    def cleanup(self) -> None:
        before = utc_now() - timedelta(days=UPLOAD_RETENTION_DAYS)
        for record in self.repository.expired(before=before):
            try:
                path = resolve_data_path(root=self.data_dir, relative=record.path, must_exist=False)
            except NotFoundError:
                logger.warning("Skipping unsafe expired upload path: id=%s", record.id)
                continue
            path.unlink(missing_ok=True)
            self.repository.remove(upload_id=record.id)
