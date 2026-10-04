from PIL import Image, ImageDraw

from app.services.image_preparation import composite_at_original

ORIGINAL_SIZE = (1280, 1280)
WORK_SIZE = (1024, 1024)


def striped_original() -> Image.Image:
    image = Image.new(mode="RGB", size=ORIGINAL_SIZE, color=(10, 120, 30))
    draw = ImageDraw.Draw(image)
    for x in range(0, ORIGINAL_SIZE[0], 7):
        draw.line(xy=[(x, 0), (x, ORIGINAL_SIZE[1])], fill=(200, 200, 40), width=2)
    return image


def square_mask() -> Image.Image:
    mask = Image.new(mode="L", size=ORIGINAL_SIZE, color=0)
    ImageDraw.Draw(mask).rectangle(xy=(500, 500, 800, 800), fill=255)
    return mask


def test_composite_keeps_original_resolution_and_untouched_pixels() -> None:
    original = striped_original()
    result = Image.new(mode="RGB", size=WORK_SIZE, color=(220, 0, 0))

    restored = composite_at_original(original=original, result=result, mask=square_mask())

    assert restored.size == ORIGINAL_SIZE
    for xy in [(10, 10), (100, 1200), (1270, 640), (420, 640)]:
        assert restored.getpixel(xy=xy) == original.getpixel(xy=xy)


def test_composite_takes_the_result_inside_the_mask() -> None:
    restored = composite_at_original(
        original=striped_original(),
        result=Image.new(mode="RGB", size=WORK_SIZE, color=(220, 0, 0)),
        mask=square_mask(),
    )
    pixel = restored.getpixel(xy=(650, 650))
    assert isinstance(pixel, tuple)
    assert pixel[0] > 200 and pixel[1] < 20
