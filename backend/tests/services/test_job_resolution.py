import pytest

from app.config import Settings
from app.errors import ValidationError
from app.models.job import JobRequest, ResolvedJob
from app.models.style import Style
from app.services.job_resolution import resolve_job
from app.services.style_service import StyleService
from app.services.task_catalog import load_catalog


def resolve(body: dict) -> ResolvedJob:
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
def test_resolve_job_checks_catalog_limits(params: dict, field: str) -> None:
    with pytest.raises(ValidationError) as error:
        resolve({"task_id": "bozza", "prompt": "cat", "params": params})
    assert error.value.details[0]["field"] == field


def test_resolve_job_ignores_styles_for_unsupported_task() -> None:
    result = resolve({"task_id": "testo", "prompt": "cat", "params": {"style_ids": ["missing"]}})
    assert result.prompt_final == "cat"
    assert result.params.style_ids == []


def test_resolve_job_rejects_future_image_task() -> None:
    with pytest.raises(ValidationError, match="non è ancora supportato"):
        resolve({"task_id": "inpaint", "prompt": "cat"})
