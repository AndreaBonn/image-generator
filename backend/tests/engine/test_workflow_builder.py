import json
from copy import deepcopy

import pytest

from app.config import REPO_ROOT, Settings
from app.engine.workflow_builder import build_workflow
from app.models.task import Scalar
from app.services.task_catalog import load_catalog


@pytest.mark.parametrize("task_id", ["bozza", "qualita", "testo"])
def test_build_workflow_matches_explicit_graph_without_mutating_template(task_id: str) -> None:
    task = next(task for task in load_catalog(settings=Settings()).tasks if task.id == task_id)
    assert task.workflow is not None
    template = json.loads((REPO_ROOT / "workflows" / task.workflow).read_text())
    original = deepcopy(template)
    expected = deepcopy(template)
    values: dict[str, Scalar] = dict(
        prompt='A sign "OPEN"',
        negative_prompt="blur",
        seed=42,
        steps=4,
        cfg=1.0,
        width=768,
        height=1280,
        batch=2,
    )
    if task_id == "testo":
        expected["4"]["inputs"]["text"] = values["prompt"]
        expected["9"]["inputs"]["noise_seed"] = 42
        expected["6"]["inputs"]["cfg"] = 1.0
        expected["8"]["inputs"].update(steps=4, width=768, height=1280)
        expected["10"]["inputs"].update(width=768, height=1280, batch_size=2)
    else:
        expected["3"]["inputs"]["text"] = values["prompt"]
        expected["4"]["inputs"]["text"] = "blur"
        expected["6"]["inputs"].update(seed=42, steps=4, cfg=1.0)
        expected["5"]["inputs"].update(width=768, height=1280, batch_size=2)
    actual = build_workflow(template=template, bindings=task.bindings, values=values)
    assert actual == expected
    actual["1"]["inputs"].clear()
    assert template == original


def test_build_workflow_uses_titles_after_node_ids_change() -> None:
    template = {"new-id": {"_meta": {"title": "@prompt_pos"}, "inputs": {"text": "old"}}}
    assert (
        build_workflow(
            template=template, bindings={"prompt": ["@prompt_pos.text"]}, values={"prompt": "new"}
        )["new-id"]["inputs"]["text"]
        == "new"
    )
