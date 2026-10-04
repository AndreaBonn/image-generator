import json
from collections.abc import Callable
from pathlib import Path
from typing import Any, cast

import pytest
import yaml
from pydantic import TypeAdapter, ValidationError

from app.config import REPO_ROOT, Settings
from app.services.task_catalog import load_catalog

read_yaml = cast(Callable[[str], object], yaml.safe_load)
write_yaml = cast(Callable[[object], str], yaml.safe_dump)
TASK_DATA = TypeAdapter(dict[str, list[dict[str, Any]]])


@pytest.fixture
def catalog_settings(tmp_path: Path) -> Settings:
    config_dir = tmp_path / "config"
    config_dir.mkdir()
    (config_dir / "tasks.yaml").write_text(
        (REPO_ROOT / "config/tasks.yaml").read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    (config_dir / "models.yaml").write_text(
        (REPO_ROOT / "config/models.yaml").read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    return Settings(
        config_dir=config_dir,
        workflows_dir=REPO_ROOT / "workflows",
        fooocus_dir=tmp_path / "fooocus",
        models_dir=tmp_path / "models",
    )


def rewrite_task(settings: Settings, field: str, value: Any) -> None:
    path = settings.config_dir / "tasks.yaml"
    data = TASK_DATA.validate_python(read_yaml(path.read_text(encoding="utf-8")))
    data["tasks"][0][field] = value
    path.write_text(data=write_yaml(data), encoding="utf-8")


def test_load_catalog_real_templates_and_missing_models(catalog_settings: Settings) -> None:
    catalog = load_catalog(settings=catalog_settings)
    tasks = {task.id: task for task in catalog.list_tasks()}
    assert len(tasks) == 9
    assert tasks["bozza"].available is False
    assert tasks["bozza"].unavailable_reason is not None
    assert "modelli" in tasks["bozza"].unavailable_reason.lower()
    assert tasks["testo"].bindings["width"] == ["@latent.width", "@scheduler.width"]
    assert tasks["qualita"].default_styles == ["Fooocus Enhance", "Fooocus Sharp"]
    assert tasks["testo"].supports_negative is False
    assert tasks["bozza"].parameters["steps"].model_dump() == {
        "default": 4,
        "min": 2,
        "max": 8,
        "options": [],
    }


def test_list_tasks_checks_both_model_sources_and_updates(catalog_settings: Settings) -> None:
    catalog = load_catalog(settings=catalog_settings)
    fooocus_model = (
        catalog_settings.fooocus_dir / "models/checkpoints/juggernautXL_v8Rundiffusion.safetensors"
    )
    new_model = catalog_settings.models_dir / "loras/sdxl_lightning_4step_lora.safetensors"
    for path in (fooocus_model, new_model):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.touch()
    task = next(task for task in catalog.list_tasks() if task.id == "bozza")
    assert task.available is True
    assert task.unavailable_reason is None
    new_model.unlink()
    task = next(task for task in catalog.list_tasks() if task.id == "bozza")
    assert task.available is False
    assert task.unavailable_reason is not None
    assert "SDXL-Lightning" in task.unavailable_reason


@pytest.mark.parametrize("reference", ["@missing.text", "@prompt_pos.missing", "invalid"])
def test_load_catalog_invalid_binding_names_field(
    catalog_settings: Settings, reference: str
) -> None:
    rewrite_task(settings=catalog_settings, field="bindings", value={"prompt": [reference]})
    with pytest.raises(ValueError, match="bindings.*prompt"):
        load_catalog(settings=catalog_settings)


def test_load_catalog_missing_template_warns_and_skips_bindings(
    catalog_settings: Settings, caplog: pytest.LogCaptureFixture
) -> None:
    rewrite_task(settings=catalog_settings, field="workflow", value="missing.json")
    rewrite_task(settings=catalog_settings, field="bindings", value={"prompt": ["@missing.text"]})
    task = load_catalog(settings=catalog_settings).list_tasks()[0]
    assert task.available is False
    assert task.unavailable_reason is not None
    assert "workflow" in task.unavailable_reason.lower()
    assert "missing.json" in caplog.text


def test_load_catalog_bad_field_stops_loading(catalog_settings: Settings) -> None:
    rewrite_task(settings=catalog_settings, field="supports_styles", value="invalid")
    with pytest.raises(ValidationError, match="supports_styles"):
        load_catalog(settings=catalog_settings)


def test_load_catalog_default_outside_limits_stops_loading(catalog_settings: Settings) -> None:
    rewrite_task(settings=catalog_settings, field="defaults", value={"steps": 99, "cfg": 1.0})
    with pytest.raises(ValidationError, match="defaults.steps"):
        load_catalog(settings=catalog_settings)


def test_load_catalog_unknown_model_stops_loading(catalog_settings: Settings) -> None:
    rewrite_task(settings=catalog_settings, field="model_ids", value=["missing_model"])
    with pytest.raises(ValueError, match="model_ids.*missing_model"):
        load_catalog(settings=catalog_settings)


def test_load_catalog_duplicate_title_stops_loading(
    catalog_settings: Settings, tmp_path: Path
) -> None:
    template = {"1": {"_meta": {"title": "@prompt_pos"}, "inputs": {"text": ""}}}
    template["2"] = template["1"]
    (tmp_path / "duplicate.json").write_text(json.dumps(obj=template), encoding="utf-8")
    rewrite_task(settings=catalog_settings, field="workflow", value="duplicate.json")
    settings = catalog_settings.model_copy(update={"workflows_dir": tmp_path})
    with pytest.raises(ValueError, match="duplicate.*@prompt_pos"):
        load_catalog(settings=settings)


def test_load_catalog_ratios_and_guidance(catalog_settings: Settings) -> None:
    tasks = load_catalog(settings=catalog_settings).list_tasks()
    for task in tasks:
        assert len(task.prompt_examples) >= 2
        assert len(set(task.prompt_examples)) == len(task.prompt_examples)
        assert task.prompt_tips
        # FLUX.2 klein handled Italian prompts in the phase 0 benchmark; SDXL lost detail.
        expected = "any" if task.id in {"upscale", "testo"} else "en"
        assert task.prompt_language.required == expected
        if task.id != "upscale":
            assert len(task.aspect_ratios) == 26
            assert sum(ratio.featured for ratio in task.aspect_ratios) == 6
            assert task.defaults["aspect_ratio"] == "1152*896"
            assert all(ratio.width % 64 == ratio.height % 64 == 0 for ratio in task.aspect_ratios)


@pytest.mark.parametrize("workflow", ["../outside.json", "/tmp/outside.json"])
def test_load_catalog_unsafe_template_path_stops_loading(
    catalog_settings: Settings, workflow: str
) -> None:
    rewrite_task(settings=catalog_settings, field="workflow", value=workflow)
    with pytest.raises(ValidationError, match="workflow"):
        load_catalog(settings=catalog_settings)


@pytest.mark.parametrize(
    ("field", "value", "error"),
    [
        ("prompt_examples", ["same", "same"], "prompt_examples"),
        ("model_ids", ["juggernaut_xl_v8", "juggernaut_xl_v8"], "model_ids"),
        ("limits", {"steps": {"min": 9, "max": 2}}, "limits.*steps"),
        ("defaults", {"steps": 1}, "defaults.steps"),
        ("defaults", {"steps": "four"}, "defaults.steps"),
        ("defaults", {"steps": 4, "aspect_ratio": "999*999"}, "defaults.aspect_ratio"),
        ("limits", {"steps": {"options": [2, 8]}}, "defaults.steps"),
    ],
)
def test_load_catalog_invalid_schema_names_field(
    catalog_settings: Settings, field: str, value: Any, error: str
) -> None:
    rewrite_task(settings=catalog_settings, field=field, value=value)
    with pytest.raises(ValidationError, match=error):
        load_catalog(settings=catalog_settings)


def test_load_catalog_rejects_duplicate_task_ids(catalog_settings: Settings) -> None:
    path = catalog_settings.config_dir / "tasks.yaml"
    data = TASK_DATA.validate_python(read_yaml(path.read_text(encoding="utf-8")))
    data["tasks"].append(data["tasks"][0])
    path.write_text(data=write_yaml(data), encoding="utf-8")
    with pytest.raises(ValidationError, match="tasks.id"):
        load_catalog(settings=catalog_settings)
