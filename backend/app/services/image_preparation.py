import asyncio
from dataclasses import replace
from io import BytesIO
from uuid import uuid4

from PIL import Image, ImageOps

from app.engine.types import EngineClient
from app.models.job import ResolvedJob
from app.services.image_geometry import work_size

MASK_THRESHOLD = 128
MASK_TABLE = [0 if value < MASK_THRESHOLD else 255 for value in range(256)]


def prepare_images(job: ResolvedJob) -> tuple[bytes, bytes | None]:
    source = job.image_input
    if source is None:
        raise ValueError("Image preparation requires a resolved source")
    size = source.size
    if job.task.id in {"inpaint", "outpaint"}:
        size = work_size(size=size)
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
