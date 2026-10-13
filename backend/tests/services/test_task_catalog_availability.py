from app.config import Settings
from app.services.task_catalog import load_catalog


def test_load_catalog_real_templates_and_missing_models(catalog_settings: Settings) -> None:
    catalog = load_catalog(settings=catalog_settings)
    tasks = {task.id: task for task in catalog.list_tasks()}
    assert len(tasks) == 16
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
            "da_schizzo",
            "in_posa",
        }
        expected = "any" if task.id in italian_ok else "en"
        assert task.prompt_language.required == expected
        if task.id not in {"upscale", "rimuovi_sfondo"}:
            assert len(task.aspect_ratios) == 26
            assert sum(ratio.featured for ratio in task.aspect_ratios) == 6
            assert task.defaults["aspect_ratio"] == "1152*896"
            assert all(ratio.width % 64 == ratio.height % 64 == 0 for ratio in task.aspect_ratios)


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
