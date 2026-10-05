from dataclasses import replace
from io import BytesIO
from pathlib import Path
from uuid import uuid4

from PIL import Image, ImageDraw

from app.config import Settings
from app.models.image_input import ImageInput
from app.models.job import JobRequest, ResolvedJob
from app.services.image_preparation import composite_at_original, restore_inpaint_output
from app.services.job_resolution import resolve_job
from app.services.style_service import StyleService
from app.services.task_catalog import load_catalog

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


def inpaint_job(tmp_path: Path) -> ResolvedJob:
    original_path, mask_path = tmp_path / "original.png", tmp_path / "mask.png"
    striped_original().save(fp=original_path)
    square_mask().save(fp=mask_path)
    request = JobRequest(
        task_id="inpaint", prompt="cat", input_upload_id=uuid4(), mask_upload_id=uuid4()
    )
    job = resolve_job(
        request=request,
        catalog=load_catalog(settings=Settings(engine_mode="fake")),
        styles=StyleService(styles=()),
        is_fake=True,
    )
    source = ImageInput(path=original_path, size=ORIGINAL_SIZE, mask_path=mask_path)
    return replace(job, image_input=source)


def png_bytes(image: Image.Image) -> bytes:
    buffer = BytesIO()
    image.save(fp=buffer, format="PNG")
    return buffer.getvalue()


def test_restore_inpaint_output_returns_the_result_at_source_resolution(tmp_path: Path) -> None:
    job = inpaint_job(tmp_path=tmp_path)
    result = png_bytes(image=Image.new(mode="RGB", size=WORK_SIZE, color=(220, 0, 0)))

    restored = Image.open(fp=BytesIO(restore_inpaint_output(job=job, image=result)))

    assert restored.size == ORIGINAL_SIZE
    assert restored.getpixel(xy=(10, 10)) == striped_original().getpixel(xy=(10, 10))


def test_restore_inpaint_output_keeps_a_result_already_at_source_size(tmp_path: Path) -> None:
    job = inpaint_job(tmp_path=tmp_path)
    result = png_bytes(image=Image.new(mode="RGB", size=ORIGINAL_SIZE, color=(220, 0, 0)))

    assert restore_inpaint_output(job=job, image=result) == result


def test_restore_inpaint_output_leaves_other_tasks_untouched(tmp_path: Path) -> None:
    job = inpaint_job(tmp_path=tmp_path)
    other = replace(job, task=job.task.model_copy(update={"id": "variazione_sottile"}))
    result = png_bytes(image=Image.new(mode="RGB", size=WORK_SIZE, color=(220, 0, 0)))

    assert restore_inpaint_output(job=other, image=result) == result


def test_restore_inpaint_output_needs_a_mask_to_composite(tmp_path: Path) -> None:
    job = inpaint_job(tmp_path=tmp_path)
    assert job.image_input is not None
    unmasked = replace(job, image_input=replace(job.image_input, mask_path=None))
    result = png_bytes(image=Image.new(mode="RGB", size=WORK_SIZE, color=(220, 0, 0)))

    assert restore_inpaint_output(job=unmasked, image=result) == result
