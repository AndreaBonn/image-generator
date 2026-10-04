import asyncio
from dataclasses import replace
from io import BytesIO
from uuid import uuid4

from PIL import Image, ImageFilter, ImageOps

from app.engine.types import EngineClient
from app.models.job import ResolvedJob
from app.services.image_geometry import FLUX_PIXEL_GRID, work_size

MASK_THRESHOLD = 128
MASK_TABLE = [0 if value < MASK_THRESHOLD else 255 for value in range(256)]
# Match the workflow's @mask_grow (12 px) and feather the seam at full resolution.
RESTORE_GROW_KERNEL = 25
RESTORE_FEATHER_RADIUS = 6


def prepare_images(job: ResolvedJob) -> tuple[bytes, bytes | None]:
    source = job.image_input
    if source is None:
        raise ValueError("Image preparation requires a resolved source")
    size = source.size
    if job.task.id in {"inpaint", "outpaint", "ingrandisci_rifinito"}:
        size = work_size(size=size)
    elif job.task.id == "modifica_libera":
        size = work_size(size=size, pixel_grid=FLUX_PIXEL_GRID)
    elif job.task.id.startswith("variazione_"):
        size = (job.params.width, job.params.height)
    with Image.open(fp=source.path) as image:
        if job.task.id.startswith("variazione_"):
            resized = ImageOps.fit(
                image=image.convert(mode="RGB"), size=size, method=Image.Resampling.LANCZOS
            )
        else:
            resized = image.convert(mode="RGB").resize(size=size, resample=Image.Resampling.LANCZOS)
        content = encode_png(image=resized)
    mask_content = None
    if source.mask_path is not None and job.task.id == "inpaint":
        with Image.open(fp=source.mask_path) as mask:
            binary = mask.convert(mode="L").resize(size=size, resample=Image.Resampling.NEAREST)
            mask_content = encode_png(image=binary.point(lut=MASK_TABLE).convert(mode="RGB"))
    return content, mask_content


def encode_png(image: Image.Image) -> bytes:
    output = BytesIO()
    image.save(fp=output, format="PNG")
    return output.getvalue()


async def upload_job_images(job: ResolvedJob, engine: EngineClient) -> ResolvedJob:
    if job.image_input is None:
        return job
    content, mask = await asyncio.to_thread(prepare_images, job=job)
    values = dict(job.binding_values)
    values["input_image"] = await engine.upload_image(image=content, name=f"{uuid4()}.png")
    if mask is not None:
        values["input_mask"] = await engine.upload_image(image=mask, name=f"{uuid4()}.png")
    return replace(job, binding_values=values)


def composite_at_original(
    original: Image.Image, result: Image.Image, mask: Image.Image
) -> Image.Image:
    """Paste the regenerated area back onto the full-resolution original.

    Inpainting runs at about 1 MP; resizing the whole result back would resample every
    pixel. Only the grown, feathered mask area comes from the result, so everything
    outside it is the user's original pixels.
    """
    base = original.convert(mode="RGB")
    upscaled = result.convert(mode="RGB").resize(size=base.size, resample=Image.Resampling.LANCZOS)
    area = mask.convert(mode="L").resize(size=base.size, resample=Image.Resampling.NEAREST)
    area = area.point(lut=MASK_TABLE).filter(ImageFilter.MaxFilter(size=RESTORE_GROW_KERNEL))
    feathered = area.filter(ImageFilter.GaussianBlur(radius=RESTORE_FEATHER_RADIUS))
    return Image.composite(image1=upscaled, image2=base, mask=feathered)


def restore_inpaint_output(job: ResolvedJob, image: bytes) -> bytes:
    """For inpaint jobs, return the result at the source resolution (see composite_at_original)."""
    source = job.image_input
    if job.task.id != "inpaint" or source is None or source.mask_path is None:
        return image
    with (
        Image.open(fp=source.path) as original,
        Image.open(fp=source.mask_path) as mask,
        Image.open(fp=BytesIO(image)) as result,
    ):
        if result.size == original.size:
            return image
        return encode_png(image=composite_at_original(original=original, result=result, mask=mask))
