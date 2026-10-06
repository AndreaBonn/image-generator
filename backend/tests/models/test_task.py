from typing import Any

import pytest
from pydantic import ValidationError

from app.models.task import ParameterLimit, TaskDefinition, validate_default

BASE_TASK: dict[str, Any] = {
    "id": "crea_da_riferimenti",
    "label": "Crea dai riferimenti",
    "description": "Mantieni il soggetto in una scena nuova.",
    "group": "crea",
    "family": "flux2_klein",
    "model_ids": ["flux2_klein_4b"],
    "bindings": {"prompt": ["@prompt_pos.text"]},
    "defaults": {"prompt": ""},
    "limits": {},
    "aspect_ratios": [],
    "supports_styles": False,
    "supports_negative": False,
    "prompt_language": {"required": "any", "label": "L", "reason": "R"},
    "prompt_tips": ["tip"],
    "prompt_examples": ["one example", "another example"],
}


def test_validate_default_accepts_non_numeric_value_without_min_or_max() -> None:
    """A limit with neither min nor max returns early, before the numeric-type check."""
    validate_default(name="style", value="warm", limit=ParameterLimit())


def test_validate_default_rejects_value_below_min() -> None:
    with pytest.raises(ValueError, match="defaults.steps"):
        validate_default(name="steps", value=1, limit=ParameterLimit(min=2, max=8))


def test_task_definition_rejects_neither_workflow_nor_by_reference_count() -> None:
    with pytest.raises(ValidationError, match="exactly one of workflow"):
        TaskDefinition.model_validate(BASE_TASK)


def test_task_definition_rejects_both_workflow_and_by_reference_count() -> None:
    with pytest.raises(ValidationError, match="exactly one of workflow"):
        TaskDefinition.model_validate(
            {
                **BASE_TASK,
                "workflow": "single.json",
                "workflow_by_reference_count": {1: "refs_1.json"},
            }
        )


def test_task_definition_accepts_workflow_by_reference_count_with_contiguous_keys() -> None:
    task = TaskDefinition.model_validate(
        {
            **BASE_TASK,
            "workflow_by_reference_count": {1: "refs_1.json", 2: "refs_2.json"},
        }
    )
    assert task.workflow is None
    assert task.workflow_by_reference_count == {1: "refs_1.json", 2: "refs_2.json"}


def test_task_definition_rejects_non_contiguous_reference_count_keys() -> None:
    with pytest.raises(ValidationError, match="contiguous starting at 1"):
        TaskDefinition.model_validate(
            {
                **BASE_TASK,
                "workflow_by_reference_count": {1: "refs_1.json", 3: "refs_3.json"},
            }
        )


def test_task_definition_rejects_directory_in_reference_count_filename() -> None:
    with pytest.raises(ValidationError, match="without directories"):
        TaskDefinition.model_validate(
            {
                **BASE_TASK,
                "workflow_by_reference_count": {1: "../outside.json"},
            }
        )
