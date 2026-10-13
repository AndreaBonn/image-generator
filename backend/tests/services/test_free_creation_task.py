import json

from app.config import Settings
from app.repositories.catalog_repository import CatalogRepository
from app.services.task_catalog import load_catalog

LUSTIFY_FILENAME = "lustifySDXL.safetensors"
LUSTIFY_OLT_SHA256 = "d7e7e35b0f60c42ad427ce81e30569a3881143ecf2f9cb50021a52947f69d22f"


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
    lustify = CatalogRepository(settings=catalog_settings).read_models()["lustify_sdxl"]
    # Same sha256 CivArchive records for the author's Civitai upload (version 1569593).
    assert lustify.source == "huggingface"
    assert lustify.repo == "NSFW-API/Lustify"
    assert lustify.sha256 == LUSTIFY_OLT_SHA256
    assert lustify.filename == LUSTIFY_FILENAME
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


def test_libero_unavailable_reason_suggests_downloading_lustify(
    catalog_settings: Settings,
) -> None:
    catalog = load_catalog(settings=catalog_settings)
    task = next(task for task in catalog.tasks if task.id == "libero")
    reason = catalog.unavailable_reason(task=task) or ""
    assert "uv run --script scripts/install_models.py --install lustify_sdxl" in reason
