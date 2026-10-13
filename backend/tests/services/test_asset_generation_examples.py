import re
from collections import Counter
from collections.abc import Callable
from pathlib import Path
from typing import Any, cast

import pytest
import yaml

from app.config import REPO_ROOT, Settings
from app.services.asset_generation import (
    EXAMPLES_PER_TASK,
    plan_examples,
)
from app.services.task_catalog import load_catalog

# Same model set as tests/conftest.py's catalog_settings, extended to
# every model the "crea" tasks without references need, so plan_examples has something
# real to filter.
EXAMPLE_MODEL_IDS = {
    "juggernaut_xl_v8",
    "sdxl_lightning_lora",
    "sdxl_offset_lora",
    "flux2_klein_4b",
    "qwen3_4b_fp4",
    "flux2_vae",
    "zimage_turbo",
    "zimage_vae",
}


def _copy_catalog_config(tmp_path: Path) -> Path:
    config_dir = tmp_path / "config"
    config_dir.mkdir()
    for name in ("tasks.yaml", "models.yaml"):
        (config_dir / name).write_text(
            (REPO_ROOT / "config" / name).read_text(encoding="utf-8"), encoding="utf-8"
        )
    return config_dir


read_yaml = cast(Callable[[str], object], yaml.safe_load)


def _touch_models(settings: Settings, model_ids: set[str]) -> None:
    models = cast(
        dict[str, list[dict[str, str]]],
        read_yaml((settings.config_dir / "models.yaml").read_text(encoding="utf-8")),
    )
    for model in models["models"]:
        if model["id"] not in model_ids:
            continue
        path = settings.models_dir / model["folder"] / model["filename"]
        path.parent.mkdir(parents=True, exist_ok=True)
        path.touch()


@pytest.fixture
def available_example_tasks(tmp_path: Path) -> list[Any]:
    """TaskView list where bozza/qualita/testo/foto (and the reference tasks sharing
    their models) are available, so plan_examples has real candidates to filter.
    """
    settings = Settings(
        config_dir=_copy_catalog_config(tmp_path),
        workflows_dir=REPO_ROOT / "workflows",
        styles_dir=tmp_path / "styles",
        models_dir=tmp_path / "models",
    )
    _touch_models(settings=settings, model_ids=EXAMPLE_MODEL_IDS)
    return load_catalog(settings=settings).list_tasks()


@pytest.fixture
def unavailable_example_tasks(tmp_path: Path) -> list[Any]:
    """Same catalog, no model touched: every task is unavailable."""
    settings = Settings(
        config_dir=_copy_catalog_config(tmp_path),
        workflows_dir=REPO_ROOT / "workflows",
        styles_dir=tmp_path / "styles",
        models_dir=tmp_path / "models",
    )
    return load_catalog(settings=settings).list_tasks()


CREA_TASK_IDS_WITHOUT_REFERENCES = {"bozza", "qualita", "testo", "foto"}
REFERENCE_TASK_IDS = {"da_schizzo", "in_posa", "crea_da_riferimenti"}


def test_plan_examples_has_two_entries_per_available_crea_task_without_references(
    available_example_tasks: list[Any],
) -> None:
    plan = plan_examples(tasks=available_example_tasks)

    counts = Counter(entry.task_id for entry in plan)
    assert set(counts) == CREA_TASK_IDS_WITHOUT_REFERENCES
    assert all(count == EXAMPLES_PER_TASK for count in counts.values())


def test_plan_examples_excludes_tasks_with_workflow_by_reference_count(
    available_example_tasks: list[Any],
) -> None:
    plan = plan_examples(tasks=available_example_tasks)

    assert {entry.task_id for entry in plan}.isdisjoint(REFERENCE_TASK_IDS)


def test_plan_examples_leaves_out_libero_even_when_lustify_is_installed(tmp_path: Path) -> None:
    # Examples show up on Home and in the Guida: an unrestricted checkpoint stays out.
    settings = Settings(
        config_dir=_copy_catalog_config(tmp_path),
        workflows_dir=REPO_ROOT / "workflows",
        styles_dir=tmp_path / "styles",
        models_dir=tmp_path / "models",
    )
    _touch_models(settings=settings, model_ids=EXAMPLE_MODEL_IDS | {"lustify_sdxl"})
    tasks = load_catalog(settings=settings).list_tasks()
    assert next(task for task in tasks if task.id == "libero").available is True

    plan = plan_examples(tasks=tasks)

    assert "libero" not in {entry.task_id for entry in plan}
    assert "qualita" in {entry.task_id for entry in plan}


def test_plan_examples_excludes_unavailable_tasks(unavailable_example_tasks: list[Any]) -> None:
    plan = plan_examples(tasks=unavailable_example_tasks)

    assert plan == []


def test_plan_examples_entries_use_the_task_default_aspect_ratio(
    available_example_tasks: list[Any],
) -> None:
    plan = plan_examples(tasks=available_example_tasks)

    for entry in plan:
        assert entry.aspect_ratio == "1152*896"
        assert (entry.width, entry.height) == (1152, 896)


def test_plan_examples_entries_take_the_first_two_prompt_examples(
    available_example_tasks: list[Any],
) -> None:
    tasks_by_id = {task.id: task for task in available_example_tasks}
    plan = plan_examples(tasks=available_example_tasks)

    for entry in plan:
        task = tasks_by_id[entry.task_id]
        assert entry.prompt in task.prompt_examples[:EXAMPLES_PER_TASK]


def test_plan_examples_ids_are_stable_16_hex_and_file_matches(
    available_example_tasks: list[Any],
) -> None:
    first = plan_examples(tasks=available_example_tasks)
    second = plan_examples(tasks=available_example_tasks)

    assert [entry.id for entry in first] == [entry.id for entry in second]
    for entry in first:
        assert re.fullmatch(r"[0-9a-f]{16}", entry.id)
        assert entry.file == f"{entry.id}.webp"


def test_plan_examples_orders_entries_by_model_family(
    available_example_tasks: list[Any],
) -> None:
    families_by_task = {task.id: task.family for task in available_example_tasks}
    plan = plan_examples(tasks=available_example_tasks)

    families_in_order: list[str] = []
    for entry in plan:
        family = families_by_task[entry.task_id]
        if not families_in_order or families_in_order[-1] != family:
            families_in_order.append(family)

    assert len(families_in_order) == len(set(families_in_order))
