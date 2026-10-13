from typing import cast

from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.models.task import ParameterLimit, ParameterSchema, PromptLanguage, Scalar, TaskView
from app.services.task_catalog import TaskCatalog

router = APIRouter()
GROUP_LABELS = {"crea": "Crea", "modifica": "Modifica", "migliora": "Migliora"}


class AspectRatioOut(BaseModel):
    value: str
    width: int
    height: int
    label: str
    featured: bool


class TaskOut(BaseModel):
    """Public shape of a task, matching frontend/src/api/types.ts (Task)."""

    id: str
    label: str
    description: str
    duration_hint: str | None
    group: str
    family: str
    available: bool
    unavailable_reason: str | None
    missing_model_ids: list[str]
    prompt_language: PromptLanguage
    prompt_tips: list[str]
    prompt_examples: list[str]
    supports_styles: bool
    supports_negative: bool
    default_styles: list[str]
    reference_labels: list[str] | None
    min_references: int
    max_references: int
    defaults: dict[str, Scalar]
    limits: dict[str, ParameterLimit]
    parameters: dict[str, ParameterSchema]
    aspect_ratios: list[AspectRatioOut]
    default_aspect_ratio: str | None


class TaskResponse(BaseModel):
    data: list[TaskOut]
    meta: dict[str, list[dict[str, str]]]


def reference_bounds(task: TaskView) -> tuple[int, int]:
    """How many reference images the task takes: (0, 0) for tasks without references."""
    templates = task.workflow_by_reference_count
    if not templates:
        return 0, 0
    return task.min_references or 1, max(templates)


def to_task_out(task: TaskView) -> TaskOut:
    default_ratio = task.defaults.get("aspect_ratio")
    return TaskOut(
        **task.model_dump(
            include=set(TaskOut.model_fields)
            - {"aspect_ratios", "default_aspect_ratio", "min_references", "max_references"}
        ),
        min_references=reference_bounds(task=task)[0],
        max_references=reference_bounds(task=task)[1],
        aspect_ratios=[
            AspectRatioOut(
                value=ratio.id,
                width=ratio.width,
                height=ratio.height,
                label=ratio.label,
                featured=ratio.featured,
            )
            for ratio in task.aspect_ratios
        ],
        default_aspect_ratio=default_ratio if isinstance(default_ratio, str) else None,
    )


@router.get("/tasks", response_model=TaskResponse)
def list_tasks(request: Request) -> TaskResponse:
    catalog = cast(TaskCatalog, request.app.state.task_catalog)
    groups = [{"id": group, "label": label} for group, label in GROUP_LABELS.items()]
    return TaskResponse(
        data=[to_task_out(task=task) for task in catalog.list_tasks()], meta={"groups": groups}
    )
