import json
from io import BytesIO

import pytest
from PIL import Image

from app.repositories.image_repository import encode_images


@pytest.mark.parametrize("mode", ["RGB", "RGBA", "P"])
def test_encode_images_preserves_alpha_and_metadata(mode: str) -> None:
    source = Image.new(mode="RGBA", size=(32, 32), color=(255, 0, 0, 128))
    source.putpixel(xy=(0, 0), value=(255, 0, 0, 0))
    source = source.convert(mode=mode)
    content = BytesIO()
    source.save(fp=content, format="PNG")
    png, webp, size = encode_images(image=content.getvalue(), metadata={"prompt": "città"})
    assert size == (32, 32)
    with Image.open(fp=BytesIO(png)) as saved, Image.open(fp=BytesIO(webp)) as thumb:
        assert json.loads(saved.info["studio_immagini"]) == {"prompt": "città"}
        assert saved.convert(mode="RGBA").getpixel(xy=(1, 1)) == (
            255,
            0,
            0,
            255 if mode == "RGB" else 128,
        )
        assert thumb.mode == ("RGB" if mode == "RGB" else "RGBA")
        assert thumb.size == size
        if mode != "RGB":
            assert thumb.getchannel(channel="A").getextrema() == (0, 128)
