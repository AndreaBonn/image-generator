import pytest

from app.config import Settings
from app.errors import ValidationError
from app.services.image_geometry import (
    closest_resolution,
    outpaint_padding,
    upscale_scale,
    work_size,
)
from app.services.task_catalog import load_catalog


@pytest.mark.parametrize(
    "size,expected",
    [
        ((64, 32), (64, 32)),
        ((1, 1), (8, 8)),
        ((4096, 4096), (1024, 1024)),
        ((1024, 4096), (512, 2048)),
        ((513, 257), (512, 256)),
    ],
)
def test_work_size_caps_area_and_preserves_small_images(
    size: tuple[int, int], expected: tuple[int, int]
) -> None:
    actual = work_size(size=size)
    assert actual == expected
    assert actual[0] * actual[1] <= 1024 * 1024
    assert all(side % 8 == 0 for side in actual)


def test_outpaint_padding_only_selected_sides() -> None:
    assert outpaint_padding(size=(1024, 512), directions=["left", "bottom"]) == {
        "pad_left": 304,
        "pad_right": 0,
        "pad_top": 0,
        "pad_bottom": 152,
    }
    assert not any(outpaint_padding(size=(1024, 512), directions=[]).values())


def test_closest_resolution_reads_catalog() -> None:
    task = load_catalog(settings=Settings()).tasks[0]
    assert closest_resolution(size=(600, 1200), ratios=task.aspect_ratios).id == "704*1408"
    assert closest_resolution(size=(100, 100), ratios=task.aspect_ratios).id == "1024*1024"


@pytest.mark.parametrize("factor,scale", [(2, 0.5), (4, 1.0)])
def test_upscale_scale_accepts_boundary(factor: int, scale: float) -> None:
    assert upscale_scale(size=(8192 // factor, 1), factor=factor) == scale
    with pytest.raises(ValidationError):
        upscale_scale(size=(8192 // factor + 1, 1), factor=factor)
