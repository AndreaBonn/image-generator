from io import BytesIO

from PIL import Image

from app.services.upload_service import decode_upload

EXIF_ORIENTATION_TAG = 0x0112
ROTATE_90_CW = 6  # stored landscape, displayed portrait


def jpeg_with_orientation(size: tuple[int, int], orientation: int) -> BytesIO:
    image = Image.new(mode="RGB", size=size, color=(200, 30, 30))
    exif = Image.Exif()
    exif[EXIF_ORIENTATION_TAG] = orientation
    buffer = BytesIO()
    image.save(fp=buffer, format="JPEG", exif=exif.tobytes())
    buffer.seek(0)
    return buffer


def test_decode_upload_applies_exif_orientation() -> None:
    decoded = decode_upload(content=jpeg_with_orientation(size=(60, 20), orientation=ROTATE_90_CW))
    assert decoded.size == (20, 60)


def test_decode_upload_keeps_size_without_orientation_tag() -> None:
    decoded = decode_upload(content=jpeg_with_orientation(size=(60, 20), orientation=1))
    assert decoded.size == (60, 20)


def test_decode_upload_flattens_transparency_on_white() -> None:
    image = Image.new(mode="RGBA", size=(10, 10), color=(255, 0, 0, 0))
    image.putpixel(xy=(5, 5), value=(0, 0, 255, 255))
    buffer = BytesIO()
    image.save(fp=buffer, format="PNG")
    buffer.seek(0)

    decoded = decode_upload(content=buffer)

    assert decoded.mode == "RGB"
    assert decoded.getpixel(xy=(0, 0)) == (255, 255, 255)
    assert decoded.getpixel(xy=(5, 5)) == (0, 0, 255)
