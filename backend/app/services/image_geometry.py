from math import sqrt

from app.errors import ValidationError
from app.models.task import AspectRatio

PIXEL_GRID = 8
MAX_WORK_AREA = 1024 * 1024
OUTPAINT_FRACTION = 0.3
UPSCALE_MODEL_FACTOR = 4
MAX_OUTPUT_SIDE = 8192


def work_size(size: tuple[int, int]) -> tuple[int, int]:
    width, height = size
    scale = min(1.0, sqrt(MAX_WORK_AREA / (width * height)))
    return (
        max(PIXEL_GRID, int(width * scale) // PIXEL_GRID * PIXEL_GRID),
        max(PIXEL_GRID, int(height * scale) // PIXEL_GRID * PIXEL_GRID),
    )


def outpaint_padding(size: tuple[int, int], directions: list[str]) -> dict[str, int]:
    width, height = size
    sides = {"left": width, "right": width, "top": height, "bottom": height}
    return {
        f"pad_{side}": round(OUTPAINT_FRACTION * length / PIXEL_GRID) * PIXEL_GRID
        if side in directions
        else 0
        for side, length in sides.items()
    }


def closest_resolution(size: tuple[int, int], ratios: list[AspectRatio]) -> AspectRatio:
    return min(ratios, key=lambda ratio: abs(ratio.width / ratio.height - size[0] / size[1]))


def upscale_scale(size: tuple[int, int], factor: int) -> float:
    if factor not in (2, 4) or max(size) * factor > MAX_OUTPUT_SIDE:
        raise ValidationError(
            details=[
                {
                    "field": "upscale_factor",
                    "message": "Scegli 2 o 4: ogni lato del risultato può arrivare a 8192 pixel.",
                }
            ]
        )
    return factor / UPSCALE_MODEL_FACTOR
