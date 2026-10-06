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
        styles_dir=tmp_path / "styles",
        models_dir=tmp_path / "models",
    )


def rewrite_task(settings: Settings, field: str, value: Any) -> None:
    path = settings.config_dir / "tasks.yaml"
    data = TASK_DATA.validate_python(read_yaml(path.read_text(encoding="utf-8")))
    data["tasks"][0][field] = value
    path.write_text(data=write_yaml(data), encoding="utf-8")


def rewrite_task_by_id(settings: Settings, task_id: str, field: str, value: Any) -> None:
    path = settings.config_dir / "tasks.yaml"
    data = TASK_DATA.validate_python(read_yaml(path.read_text(encoding="utf-8")))
    task = next(task for task in data["tasks"] if task["id"] == task_id)
    task[field] = value
    path.write_text(data=write_yaml(data), encoding="utf-8")


def test_load_catalog_real_templates_and_missing_models(catalog_settings: Settings) -> None:
    catalog = load_catalog(settings=catalog_settings)
    tasks = {task.id: task for task in catalog.list_tasks()}
    assert len(tasks) == 13
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
        catalog_settings.models_dir / "checkpoints/juggernautXL_v8Rundiffusion.safetensors"
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
        # FLUX.2 klein and Z-Image handled Italian prompts in real runs; SDXL lost detail.
        italian_ok = {
            "upscale",
            "testo",
            "foto",
            "modifica_libera",
            "rimuovi_sfondo",
            "crea_da_riferimenti",
        }
        expected = "any" if task.id in italian_ok else "en"
        assert task.prompt_language.required == expected
        if task.id not in {"upscale", "rimuovi_sfondo"}:
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


def test_load_catalog_aspect_ratio_id_mismatch_stops_loading(catalog_settings: Settings) -> None:
    rewrite_task(
        settings=catalog_settings,
        field="aspect_ratios",
        value=[
            {"id": "999*999", "width": 1152, "height": 896, "label": "Quadrato", "featured": True}
        ],
    )
    with pytest.raises(ValidationError, match="aspect_ratios.id must match"):
        load_catalog(settings=catalog_settings)


def test_load_catalog_duplicate_aspect_ratios_stops_loading(catalog_settings: Settings) -> None:
    rewrite_task(
        settings=catalog_settings,
        field="aspect_ratios",
        value=[
            {"id": "1152*896", "width": 1152, "height": 896, "label": "A", "featured": True},
            {"id": "1152*896", "width": 1152, "height": 896, "label": "B", "featured": False},
        ],
    )
    with pytest.raises(ValidationError, match="aspect_ratios must be distinct"):
        load_catalog(settings=catalog_settings)


def test_load_catalog_default_styles_without_supports_styles_stops_loading(
    catalog_settings: Settings,
) -> None:
    rewrite_task(settings=catalog_settings, field="default_styles", value=["Fooocus Enhance"])
    rewrite_task(settings=catalog_settings, field="supports_styles", value=False)
    with pytest.raises(ValidationError, match="default_styles requires supports_styles"):
        load_catalog(settings=catalog_settings)


def test_load_catalog_rejects_duplicate_task_ids(catalog_settings: Settings) -> None:
    path = catalog_settings.config_dir / "tasks.yaml"
    data = TASK_DATA.validate_python(read_yaml(path.read_text(encoding="utf-8")))
    data["tasks"].append(data["tasks"][0])
    path.write_text(data=write_yaml(data), encoding="utf-8")
    with pytest.raises(ValidationError, match="tasks.id"):
        load_catalog(settings=catalog_settings)


def test_load_catalog_lists_reference_task_without_crashing(
    catalog_settings: Settings,
) -> None:
    """crea_da_riferimenti uses workflow_by_reference_count, not workflow; it must
    still load, appear in /tasks, and only be unavailable for missing models.
    """
    catalog = load_catalog(settings=catalog_settings)
    task = next(task for task in catalog.list_tasks() if task.id == "crea_da_riferimenti")
    assert task.workflow is None
    assert task.workflow_by_reference_count == {
        1: "flux2_klein_refs_1.json",
        2: "flux2_klein_refs_2.json",
        3: "flux2_klein_refs_3.json",
    }
    assert task.available is False
    assert task.unavailable_reason is not None
    assert "Modelli non installati" in task.unavailable_reason


def test_load_catalog_missing_reference_count_template_stops_loading(
    catalog_settings: Settings,
) -> None:
    rewrite_task_by_id(
        settings=catalog_settings,
        task_id="crea_da_riferimenti",
        field="workflow_by_reference_count",
        value={1: "flux2_klein_refs_1.json", 2: "missing_refs_2.json"},
    )
    with pytest.raises(ValueError, match="missing_refs_2.json"):
        load_catalog(settings=catalog_settings)


def test_load_catalog_missing_reference_title_stops_loading(
    catalog_settings: Settings, tmp_path: Path
) -> None:
    """A template present on disk but missing @input_image_2/@resize_2 for count=2
    must stop startup and name both the file and the missing title.
    """
    workflows_dir = tmp_path / "workflows"
    workflows_dir.mkdir()
    for name in ("flux2_klein_refs_1.json", "flux2_klein_refs_2.json", "flux2_klein_refs_3.json"):
        source = REPO_ROOT / "workflows" / name
        (workflows_dir / name).write_text(source.read_text(encoding="utf-8"), encoding="utf-8")
    broken = json.loads((workflows_dir / "flux2_klein_refs_2.json").read_text(encoding="utf-8"))
    del broken["20"]  # @resize_2, see workflows/flux2_klein_refs_2.json
    (workflows_dir / "flux2_klein_refs_2.json").write_text(
        data=json.dumps(obj=broken), encoding="utf-8"
    )
    settings = catalog_settings.model_copy(update={"workflows_dir": workflows_dir})
    with pytest.raises(ValueError, match=r"flux2_klein_refs_2\.json.*@resize_2"):
        load_catalog(settings=settings)


def test_unavailable_reason_suggests_install_command_per_missing_model(
    catalog_settings: Settings,
) -> None:
    """bozza needs juggernaut_xl_v8 (migratable) and sdxl_lightning_lora (not): both
    are missing, so the hint carries the migrate shortcut and the generic install
    command with the specific model id, not a generic "Vedi Impostazioni" only.
    """
    catalog = load_catalog(settings=catalog_settings)
    task = next(task for task in catalog.tasks if task.id == "bozza")
    reason = catalog.unavailable_reason(task=task)
    assert reason is not None
    assert "uv run --script scripts/migrate_from_fooocus.py --apply" in reason
    assert "uv run --script scripts/install_models.py --install sdxl_lightning_lora" in reason


def test_unavailable_reason_omits_migrate_command_when_model_not_migratable(
    catalog_settings: Settings,
) -> None:
    """Once the migratable model (juggernaut) is installed, the remaining missing
    model (sdxl_lightning_lora, not fooocus_migratable) must not suggest migration.
    """
    checkpoint = catalog_settings.models_dir / "checkpoints/juggernautXL_v8Rundiffusion.safetensors"
    checkpoint.parent.mkdir(parents=True)
    checkpoint.touch()
    catalog = load_catalog(settings=catalog_settings)
    task = next(task for task in catalog.tasks if task.id == "bozza")
    reason = catalog.unavailable_reason(task=task)
    assert reason is not None
    assert "migrate_from_fooocus" not in reason
    assert "uv run --script scripts/install_models.py --install sdxl_lightning_lora" in reason
