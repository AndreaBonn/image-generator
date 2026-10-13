import json

from app.config import Settings
from app.repositories.catalog_repository import CatalogRepository
from app.services.system_service import model_status
from app.services.task_catalog import load_catalog

LUSTIFY_FILENAME = "lustifySDXL.safetensors"


def test_libero_task_uses_its_own_checkpoint_and_no_default_styles(
    catalog_settings: Settings,
) -> None:
    tasks = load_catalog(settings=catalog_settings).tasks
    task = next(task for task in tasks if task.id == "libero")
    assert task.label == "Creazione libera"
    assert task.group == "crea"
    assert task.family == "sdxl_libero"
    assert task.model_ids == ["lustify_sdxl", "sdxl_offset_lora"]
    assert task.default_styles == []
    assert task.supports_negative is True


def test_libero_workflow_loads_the_registered_lustify_file(catalog_settings: Settings) -> None:
    models = CatalogRepository(settings=catalog_settings).read_models()
    assert models["lustify_sdxl"].source == "local"
    assert models["lustify_sdxl"].filename == LUSTIFY_FILENAME
    workflow = json.loads(
        s=(catalog_settings.workflows_dir / "sdxl_libero_txt2img.json").read_text(encoding="utf-8")
    )
    checkpoint = next(node for node in workflow.values() if node["_meta"]["title"] == "@checkpoint")
    assert checkpoint["inputs"]["ckpt_name"] == LUSTIFY_FILENAME


def test_libero_task_becomes_available_once_the_checkpoint_is_in_place(
    catalog_settings: Settings,
) -> None:
    catalog = load_catalog(settings=catalog_settings)
    lustify = catalog_settings.models_dir / "checkpoints" / LUSTIFY_FILENAME
    offset_lora = catalog_settings.models_dir / "loras/sd_xl_offset_example-lora_1.0.safetensors"
    offset_lora.parent.mkdir(parents=True, exist_ok=True)
    offset_lora.touch()
    task = next(task for task in catalog.list_tasks() if task.id == "libero")
    assert task.available is False
    assert task.unavailable_reason is not None
    assert "Lustify" in task.unavailable_reason
    lustify.parent.mkdir(parents=True, exist_ok=True)
    lustify.touch()
    task = next(task for task in catalog.list_tasks() if task.id == "libero")
    assert task.available is True


def test_libero_unavailable_reason_gives_manual_steps_not_a_failing_command(
    catalog_settings: Settings,
) -> None:
    catalog = load_catalog(settings=catalog_settings)
    lustify = catalog.models["lustify_sdxl"]
    assert lustify.manual_install is not None
    assert LUSTIFY_FILENAME in lustify.manual_install
    task = next(task for task in catalog.tasks if task.id == "libero")
    reason = catalog.unavailable_reason(task=task) or ""
    assert lustify.manual_install in reason
    assert "--install lustify_sdxl" not in reason
    # The offset LoRA is missing too and still gets its regular command.
    assert "uv run --script scripts/migrate_from_fooocus.py --apply" in reason


def test_lustify_status_marks_it_as_manual_install(catalog_settings: Settings) -> None:
    catalog = load_catalog(settings=catalog_settings)
    status = model_status(model=catalog.models["lustify_sdxl"], catalog=catalog)
    assert status["manual_install"] == catalog.models["lustify_sdxl"].manual_install
    regular = model_status(model=catalog.models["sdxl_lightning_lora"], catalog=catalog)
    assert regular["manual_install"] is None
