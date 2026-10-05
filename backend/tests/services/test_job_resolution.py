from typing import Any
from uuid import uuid4

import pytest

from app.config import Settings
from app.errors import ValidationError
from app.models.job import JobRequest, ResolvedJob
from app.models.style import Style
from app.models.task import ParameterLimit
from app.services.job_resolution import resolve_job, resolve_task, validate_limits
from app.services.style_service import StyleService
from app.services.task_catalog import load_catalog


def resolve(body: dict[str, Any]) -> ResolvedJob:
    return resolve_job(
        request=JobRequest.model_validate(body),
        catalog=load_catalog(settings=Settings(engine_mode="fake")),
        styles=StyleService(
            styles=(
                Style(name="Fooocus Enhance", prompt="{prompt}, detailed", negative_prompt="blur"),
                Style(name="Fooocus Sharp", prompt="{prompt}, sharp", negative_prompt="blur"),
            )
        ),
        is_fake=True,
    )


@pytest.mark.parametrize(
    "task_id,steps,prompt",
    [("bozza", 4, "cat"), ("qualita", 30, "cat, detailed, sharp"), ("testo", 4, "cat")],
)
def test_resolve_job_defaults_styles_and_seed(task_id: str, steps: int, prompt: str) -> None:
    result = resolve({"task_id": task_id, "prompt": "cat"})
    assert result.prompt_final == prompt
    assert result.params.steps == steps
    assert result.params.width == 1152
    assert result.params.height == 896
    assert 0 <= result.params.seed <= 2**32 - 1


@pytest.mark.parametrize(
    "params,field",
    [
        ({"steps": 9}, "params.steps"),
        ({"cfg": 4}, "params.cfg"),
        ({"aspect_ratio": "1*1"}, "params.aspect_ratio"),
    ],
)
def test_resolve_job_checks_catalog_limits(
    params: dict[str, int | float | str], field: str
) -> None:
    with pytest.raises(ValidationError) as error:
        resolve({"task_id": "bozza", "prompt": "cat", "params": params})
    assert error.value.details[0]["field"] == field


def test_resolve_job_ignores_styles_for_unsupported_task() -> None:
    result = resolve({"task_id": "testo", "prompt": "cat", "params": {"style_ids": ["missing"]}})
    assert result.prompt_final == "cat"
    assert result.params.style_ids == []


def test_resolve_job_requires_image_for_inpaint() -> None:
    with pytest.raises(ValidationError) as error:
        resolve({"task_id": "inpaint", "prompt": "cat"})
    assert error.value.details[0]["field"] == "input_upload_id"


def test_resolve_job_foto_uses_zimage_defaults() -> None:
    result = resolve({"task_id": "foto", "prompt": "cat", "params": {"seed": 5}})

    assert result.task.family == "zimage"
    assert (result.params.steps, result.params.cfg) == (8, 1.0)
    assert (result.params.width, result.params.height) == (1152, 896)
    assert result.prompt_final == "cat"


def test_resolve_job_foto_requires_a_prompt() -> None:
    with pytest.raises(ValidationError) as error:
        resolve({"task_id": "foto", "prompt": "  "})
    assert error.value.details[0]["field"] == "prompt"


def test_resolve_job_rejects_both_upload_and_generation_source() -> None:
    with pytest.raises(ValidationError) as error:
        resolve(
            {
                "task_id": "inpaint",
                "prompt": "cat",
                "input_upload_id": str(uuid4()),
                "source_generation_id": str(uuid4()),
                "mask_upload_id": str(uuid4()),
            }
        )
    assert error.value.details[0]["field"] == "input_upload_id"


def test_validate_limits_skips_a_parameter_without_a_submitted_value() -> None:
    bozza = next(
        task
        for task in load_catalog(settings=Settings(engine_mode="fake")).tasks
        if task.id == "bozza"
    )
    assert "steps" in bozza.limits
    validate_limits(task=bozza, values={})  # no "steps" key: must not raise


def test_validate_limits_checks_non_numeric_value_only_against_options() -> None:
    bozza = next(
        task
        for task in load_catalog(settings=Settings(engine_mode="fake")).tasks
        if task.id == "bozza"
    )
    task = bozza.model_copy(
        update={"limits": {**bozza.limits, "theme": ParameterLimit(options=["warm", "cool"])}}
    )
    validate_limits(task=task, values={"theme": "warm"})  # non-numeric, within options
    with pytest.raises(ValidationError) as error:
        validate_limits(task=task, values={"theme": "ice"})
    assert error.value.details[0]["field"] == "params.theme"


def test_resolve_task_rejects_a_catalog_task_without_an_implementation() -> None:
    catalog = load_catalog(settings=Settings(engine_mode="fake"))
    bozza = next(task for task in catalog.tasks if task.id == "bozza")
    catalog.tasks = [*catalog.tasks, bozza.model_copy(update={"id": "futuro"})]

    with pytest.raises(ValidationError) as error:
        resolve_task(
            request=JobRequest(task_id="futuro", prompt="cat"), catalog=catalog, is_fake=True
        )

    assert error.value.message == "Questo compito non è ancora supportato."
