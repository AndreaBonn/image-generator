from dataclasses import replace
from io import BytesIO
from pathlib import Path
from uuid import uuid4

import pytest
from PIL import Image

from app.config import Settings
from app.errors import ValidationError
from app.models.image_input import ImageInput
from app.models.job import JobParams, JobRequest, ResolvedJob
from app.services.image_geometry import work_size
from app.services.image_preparation import prepare_images
from app.services.job_inputs import image_dimensions
from app.services.job_resolution import resolve_job
from app.services.style_service import StyleService
from app.services.task_catalog import load_catalog


def resolve(task_id: str, prompt: str = "metti il cielo al tramonto") -> ResolvedJob:
    return resolve_job(
        request=JobRequest(task_id=task_id, prompt=prompt, input_upload_id=uuid4()),
        catalog=load_catalog(settings=Settings()),
        styles=StyleService(styles=()),
        is_fake=True,
    )


@pytest.mark.parametrize(
    "source,expected",
    [((1, 1), (16, 16)), ((537, 281), (528, 272)), ((2304, 1792), (1152, 896))],
)
def test_work_size_flux_grid(source: tuple[int, int], expected: tuple[int, int]) -> None:
    assert work_size(size=source, pixel_grid=16) == expected


@pytest.mark.parametrize(
    "task_id,output,uploaded",
    [
        ("modifica_libera", (1152, 896), (1152, 896)),
        ("rimuovi_sfondo", (2304, 1792), (2304, 1792)),
        ("ingrandisci_rifinito", (2320, 1792), (1160, 896)),
    ],
)
def test_new_task_dimensions_and_preparation(
    tmp_path: Path, task_id: str, output: tuple[int, int], uploaded: tuple[int, int]
) -> None:
    path = tmp_path / "source.png"
    Image.new(mode="RGB", size=(2304, 1792), color="red").save(fp=path)
    source = ImageInput(path=path, size=(2304, 1792))
    job = replace(resolve(task_id=task_id), image_input=source)
    dimensions, values = image_dimensions(job=job, source=source)
    assert dimensions == output
    assert values == ({"denoise": 0.3} if task_id == "ingrandisci_rifinito" else {})
    content, mask = prepare_images(job=job)
    with Image.open(fp=BytesIO(content)) as prepared:
        assert prepared.size == uploaded
        assert prepared.getpixel(xy=(0, 0)) == (255, 0, 0)
    assert mask is None


def test_edit_requires_prompt_and_uses_multilingual_guidance() -> None:
    job = resolve(task_id="modifica_libera")
    assert job.task.prompt_language.required == "any"
    assert job.prompt_final == "metti il cielo al tramonto"
    with pytest.raises(ValidationError) as error:
        resolve(task_id="modifica_libera", prompt="  ")
    assert error.value.details[0]["field"] == "prompt"


@pytest.mark.parametrize("task_id", ["rimuovi_sfondo", "ingrandisci_rifinito"])
def test_improvement_prompt_is_optional(task_id: str) -> None:
    job = resolve(task_id=task_id, prompt="")
    assert job.prompt_final == ""
    assert job.params.batch == 1


@pytest.mark.parametrize("denoise", [0.1, 0.5])
def test_refinement_denoise_boundaries_reach_bindings(denoise: float) -> None:
    job = resolve(task_id="ingrandisci_rifinito")
    request = job.request.model_copy(update={"params": JobParams(denoise=denoise)})
    job = resolve_job(
        request=request,
        catalog=load_catalog(settings=Settings()),
        styles=StyleService(styles=()),
        is_fake=True,
    )
    _, values = image_dimensions(
        job=job, source=ImageInput(path=Path("unused.png"), size=(537, 281))
    )
    assert values["denoise"] == denoise


@pytest.mark.parametrize("denoise", [0.09, 0.51])
def test_refinement_rejects_denoise_outside_limits(denoise: float) -> None:
    with pytest.raises(ValidationError) as error:
        resolve_job(
            request=JobRequest(
                task_id="ingrandisci_rifinito",
                input_upload_id=uuid4(),
                params=JobParams(denoise=denoise),
            ),
            catalog=load_catalog(settings=Settings()),
            styles=StyleService(styles=()),
            is_fake=True,
        )
    assert error.value.details[0]["field"] == "params.denoise"
