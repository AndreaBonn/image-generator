from struct import Struct
from typing import Literal

from app.engine.types import PreviewImage

PREVIEW_HEADER = Struct(">II")
PREVIEW_IMAGE_EVENT = 1
IMAGE_MEDIA_TYPES: dict[int, Literal["image/jpeg", "image/png"]] = {
    1: "image/jpeg",
    2: "image/png",
}


def parse_preview(frame: bytes) -> PreviewImage | None:
    if len(frame) <= PREVIEW_HEADER.size:
        return None
    event_type, image_type = PREVIEW_HEADER.unpack_from(buffer=frame)
    media_type = IMAGE_MEDIA_TYPES.get(image_type)
    if event_type != PREVIEW_IMAGE_EVENT or media_type is None:
        return None
    return PreviewImage(content=frame[PREVIEW_HEADER.size :], media_type=media_type)
