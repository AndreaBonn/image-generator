from typing import cast

from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.models.task import TaskView
from app.services.task_catalog import TaskCatalog

router = APIRouter()
GROUP_LABELS = {"crea": "Crea", "modifica": "Modifica", "migliora": "Migliora"}


class TaskResponse(BaseModel):
    data: list[TaskView]
    meta: dict[str, list[dict[str, str]]]


@router.get("/tasks", response_model=TaskResponse)
def list_tasks(request: Request) -> TaskResponse:
    catalog = cast(TaskCatalog, request.app.state.task_catalog)
    groups = [{"id": group, "label": label} for group, label in GROUP_LABELS.items()]
    return TaskResponse(data=catalog.list_tasks(), meta={"groups": groups})
