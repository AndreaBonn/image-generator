import json
from collections.abc import Callable
from pathlib import Path
from typing import Any, Literal, Self, cast

import yaml
from pydantic import BaseModel, Field, RootModel, model_validator

from app.config import Settings
from app.models.task import TaskDocument

read_yaml = cast(Callable[[str], object], yaml.safe_load)


class ModelEntry(BaseModel):
    id: str
    label: str
    source: Literal["local", "huggingface"]
    folder: str
    filename: str
    family: str = ""
    size_bytes: int = Field(default=0, ge=0)
    enabled: bool = True
    license: str = ""
    fooocus_migratable: bool = False
    repo: str | None = None
    repo_path: str | None = None
    sha256: str | None = None

    @model_validator(mode="after")
    def validate_relative_paths(self) -> Self:
        for name in ("folder", "filename"):
            value = getattr(self, name)
            if Path(value).is_absolute() or ".." in Path(value).parts:
                raise ValueError(f"models.{name} must be a relative path")
        return self


class ModelDocument(BaseModel):
    models: list[ModelEntry]

    @model_validator(mode="after")
    def validate_unique_models(self) -> Self:
        ids = [model.id for model in self.models]
        if len(ids) != len(set(ids)):
            raise ValueError("models.id must be unique")
        return self


class WorkflowNode(BaseModel):
    metadata: dict[str, Any] = Field(alias="_meta", default_factory=dict)
    inputs: dict[str, Any]


class WorkflowDocument(RootModel[dict[str, WorkflowNode]]):
    pass


class CatalogRepository:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def read_tasks(self) -> TaskDocument:
        path = self.settings.config_dir / "tasks.yaml"
        return TaskDocument.model_validate(obj=read_yaml(path.read_text(encoding="utf-8")))

    def read_models(self) -> dict[str, ModelEntry]:
        path = self.settings.config_dir / "models.yaml"
        data = read_yaml(path.read_text(encoding="utf-8"))
        document = ModelDocument.model_validate(obj=data)
        return {model.id: model for model in document.models}

    def read_workflow(self, filename: str) -> dict[str, WorkflowNode] | None:
        path = self.settings.workflows_dir / filename
        if not path.is_file():
            return None
        data = json.loads(s=path.read_text(encoding="utf-8"))
        return WorkflowDocument.model_validate(obj=data).root

    def has_workflow(self, filename: str) -> bool:
        return (self.settings.workflows_dir / filename).is_file()

    def has_model(self, model: ModelEntry) -> bool:
        root = self.settings.models_dir
        return (root / model.folder / model.filename).is_file()
