import pytest
from install_support import install, install_models

BASE_MODEL_IDS = (
    "juggernaut_xl_v8",
    "sdxl_offset_lora",
    "fooocus_inpaint_head",
    "fooocus_inpaint_patch",
    "sdxl_lightning_lora",
    "ultrasharp_4x",
)


def real_base_profile_entries():
    registry = install_models.load_registry()
    return [entry for entry in registry if entry.id in BASE_MODEL_IDS]


def test_disk_budget_sufficient_space_is_ok():
    budget = install.disk_budget(missing=[], free_bytes=20_000_000_000, margin_gb=5.0)
    assert budget.ok is True
    assert budget.shortfall_gb == 0.0


def test_disk_budget_insufficient_rejects_with_italian_message():
    """9 GB free cannot cover the base profile (~8.9 GB) plus a 5 GB margin."""
    budget = install.disk_budget(
        missing=real_base_profile_entries(), free_bytes=9_000_000_000, margin_gb=5.0
    )
    assert budget.ok is False
    assert "8,9 GB" in budget.describe()


def test_disk_budget_exactly_at_margin_is_ok():
    budget = install.disk_budget(missing=[], free_bytes=5_000_000_000, margin_gb=5.0)
    assert budget.ok is True


def test_plan_steps_nothing_to_do_returns_empty_list():
    state = install.InstallState(
        engine_installed=True,
        backend_deps_installed=True,
        frontend_built=True,
        missing_style_filenames=(),
        missing_model_ids=(),
    )
    assert install.plan_steps(profile="completo", state=state) == []


def test_plan_steps_orders_engine_deps_styles_models():
    state = install.InstallState(
        engine_installed=False,
        backend_deps_installed=False,
        frontend_built=False,
        missing_style_filenames=("sdxl_styles_sai.json",),
        missing_model_ids=("ultrasharp_4x",),
    )
    steps = install.plan_steps(profile="completo", state=state)
    assert [step.name for step in steps] == [
        "engine",
        "backend_deps",
        "frontend_build",
        "styles",
        "models",
    ]


def test_plan_steps_profile_base_ignores_models_outside_the_base_set():
    """flux2_klein_4b is enabled but not part of --profile base: no models step."""
    state = install.InstallState(
        engine_installed=True,
        backend_deps_installed=True,
        frontend_built=True,
        missing_model_ids=("flux2_klein_4b",),
    )
    assert install.plan_steps(profile="base", state=state) == []


def test_plan_steps_profile_base_includes_models_inside_the_base_set():
    state = install.InstallState(
        engine_installed=True,
        backend_deps_installed=True,
        frontend_built=True,
        missing_model_ids=("ultrasharp_4x", "flux2_klein_4b"),
    )
    steps = install.plan_steps(profile="base", state=state)
    assert len(steps) == 1
    assert steps[0].name == "models"
    assert "ultrasharp_4x" in steps[0].description
    assert "flux2_klein_4b" not in steps[0].description


def test_base_profile_leaves_out_the_optional_lustify_checkpoint():
    """Lustify only serves the optional `libero` task: the base profile must not pull 7 GB."""
    registry = install_models.load_registry()
    base_ids = install.base_profile_model_ids(registry)
    assert "lustify_sdxl" not in base_ids
    assert set(BASE_MODEL_IDS) <= base_ids


def test_plan_steps_profile_completo_includes_every_missing_model():
    state = install.InstallState(
        engine_installed=True,
        backend_deps_installed=True,
        frontend_built=True,
        missing_model_ids=("ultrasharp_4x", "flux2_klein_4b"),
    )
    steps = install.plan_steps(profile="completo", state=state)
    assert len(steps) == 1
    assert "ultrasharp_4x" in steps[0].description
    assert "flux2_klein_4b" in steps[0].description


def test_plan_steps_rejects_unknown_profile():
    state = install.InstallState(
        engine_installed=True, backend_deps_installed=True, frontend_built=True
    )
    with pytest.raises(ValueError, match="unknown profile"):
        install.plan_steps(profile="deluxe", state=state)
