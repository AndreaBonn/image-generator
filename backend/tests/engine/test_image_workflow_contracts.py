import json
from copy import deepcopy

import pytest

from app.config import Settings
from app.engine.workflow_builder import build_workflow
from app.models.task import Scalar
from app.services.task_catalog import load_catalog

EXPECTED_INPUTS: dict[str, dict[str, dict[str, Scalar]]] = {
    "modifica_libera": {
        "4": {"image": "uploaded.png"},
        "5": {"width": 528, "height": 272},
        "7": {"text": "new sky"},
        "11": {"cfg": 1.5},
        "13": {"steps": 8, "width": 528, "height": 272},
        "14": {"noise_seed": 123},
        "15": {"width": 528, "height": 272, "batch_size": 2},
    },
    "rimuovi_sfondo": {"1": {"image": "uploaded.png"}},
    "ingrandisci_rifinito": {
        "3": {"text": "new sky"},
        "4": {"text": "blur"},
        "5": {"image": "uploaded.png"},
        "8": {"width": 528, "height": 272},
        "11": {"seed": 123, "steps": 8, "cfg": 1.5, "denoise": 0.4},
        "13": {"final_width": 528, "final_height": 272},
    },
}


@pytest.mark.parametrize("task_id", list(EXPECTED_INPUTS))
def test_image_bindings_match_explicit_graph_and_preserve_template(task_id: str) -> None:
    settings = Settings()
    task = next(task for task in load_catalog(settings=settings).tasks if task.id == task_id)
    assert task.workflow is not None
    template = json.loads(s=(settings.workflows_dir / task.workflow).read_text(encoding="utf-8"))
    original = deepcopy(template)
    expected = deepcopy(template)
    values: dict[str, Scalar] = {
        "input_image": "uploaded.png",
        "prompt": "new sky",
        "negative_prompt": "blur",
        "width": 528,
        "height": 272,
        "seed": 123,
        "steps": 8,
        "cfg": 1.5,
        "batch": 2,
        "denoise": 0.4,
    }
    for node_id, inputs in EXPECTED_INPUTS[task_id].items():
        expected[node_id]["inputs"].update(inputs)
    actual = build_workflow(template=template, bindings=task.bindings, values=values)
    assert actual == expected
    actual["1"]["inputs"].clear()
    assert template == original
