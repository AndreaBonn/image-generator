from dataclasses import replace
from io import BytesIO
from pathlib import Path
from uuid import uuid4

import pytest
from PIL import Image

from app.config import Settings
from app.models.image_input import ImageInput
from app.models.job import JobRequest
from app.services.image_preparation import prepare_images
from app.services.job_resolution import resolve_job
from app.services.style_service import StyleService
from app.services.task_catalog import load_catalog


def test_prepare_images_keeps_image_and_mask_coordinates(tmp_path: Path) -> None:
    image = Image.new(mode="RGB", size=(1, 32), color="black")
    image.putpixel(xy=(0, 0), value=(255, 255, 255))
    image.putpixel(xy=(0, 1), value=(127, 127, 127))
    image.putpixel(xy=(0, 2), value=(128, 128, 128))
    path = tmp_path / "source.png"
    image.save(fp=path)
    request = JobRequest(
        task_id="inpaint", prompt="cat", input_upload_id=uuid4(), mask_upload_id=uuid4()
    )
    job = resolve_job(
        request=request,
        catalog=load_catalog(settings=Settings()),
        styles=StyleService(styles=()),
        is_fake=True,
    )
    job = replace(job, image_input=ImageInput(path=path, mask_path=path, size=(1, 32)))
    content, mask = prepare_images(job=job)
    assert mask is not None
    with Image.open(fp=BytesIO(content)) as resized:
        assert resized.size == (8, 32)
        assert resized.getpixel(xy=(0, 0)) == (255, 255, 255)
    with Image.open(fp=BytesIO(mask)) as binary:
        assert binary.size == (8, 32)
        assert binary.getpixel(xy=(0, 0)) == (255, 255, 255)
        assert binary.getpixel(xy=(0, 1)) == (0, 0, 0)
        assert binary.getpixel(xy=(0, 2)) == (255, 255, 255)


def test_prepare_images_without_resolved_source_rejects() -> None:
    job = resolve_job(
        request=JobRequest(task_id="bozza", prompt="cat"),
        catalog=load_catalog(settings=Settings()),
        styles=StyleService(styles=()),
        is_fake=True,
    )
    assert job.image_input is None
    with pytest.raises(ValueError, match="requires a resolved source"):
        prepare_images(job=job)
