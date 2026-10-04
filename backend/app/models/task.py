from pathlib import Path
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Scalar = str | int | float | bool | None
NonEmptyText = Annotated[str, Field(min_length=1)]
BindingReference = Annotated[str, Field(pattern=r"^@[^.]+\.[^.]+$")]


class CatalogModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PromptLanguage(CatalogModel):
    required: Literal["en", "it", "any"]
    label: NonEmptyText
    reason: NonEmptyText


class AspectRatio(CatalogModel):
    id: NonEmptyText
    width: int = Field(gt=0, multiple_of=16)
    height: int = Field(gt=0, multiple_of=16)
    label: NonEmptyText
    featured: bool

    @model_validator(mode="after")
    def validate_resolution(self) -> Self:
        if self.id != f"{self.width}*{self.height}":
            raise ValueError("aspect_ratios.id must match width*height")
        return self


class ParameterLimit(CatalogModel):
    min: float | None = None
    max: float | None = None
    options: list[Scalar] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_range(self) -> Self:
        if self.min is not None and self.max is not None and self.min > self.max:
            raise ValueError("limits.min must not exceed limits.max")
        return self


class ParameterSchema(ParameterLimit):
    default: Scalar = None


class TaskDefinition(CatalogModel):
    id: NonEmptyText
    label: NonEmptyText
    description: NonEmptyText
    group: Literal["crea", "modifica", "migliora"]
    family: Literal["sdxl", "flux2_klein", "zimage", "upscale"]
    workflow: NonEmptyText
    model_ids: list[NonEmptyText] = Field(min_length=1)
    bindings: dict[str, list[BindingReference]]
    defaults: dict[str, Scalar]
    limits: dict[str, ParameterLimit]
    aspect_ratios: list[AspectRatio]
    supports_styles: bool
    free_on_family_switch: bool = False
    supports_negative: bool
    default_styles: list[str] = Field(default_factory=list)
    prompt_language: PromptLanguage
    prompt_tips: list[NonEmptyText] = Field(min_length=1)
    prompt_examples: list[NonEmptyText] = Field(min_length=2)

    @field_validator("workflow")
    @classmethod
    def validate_workflow(cls, value: str) -> str:
        if Path(value).name != value or Path(value).suffix != ".json":
            raise ValueError("workflow must be a JSON filename without directories")
        return value

    @field_validator("prompt_examples", "model_ids")
    @classmethod
    def validate_unique_entries(cls, value: list[str]) -> list[str]:
        if len(value) != len(set(value)):
            raise ValueError("entries must be distinct")
        return value

    @model_validator(mode="after")
    def validate_defaults(self) -> Self:
        for name, limit in self.limits.items():
            validate_default(name=name, value=self.defaults.get(name), limit=limit)
        ratio_ids = [ratio.id for ratio in self.aspect_ratios]
        if len(ratio_ids) != len(set(ratio_ids)):
            raise ValueError("aspect_ratios must be distinct")
        if ratio_ids and self.defaults.get("aspect_ratio") not in ratio_ids:
            raise ValueError("defaults.aspect_ratio must reference an aspect_ratios.id")
        if not self.supports_styles and self.default_styles:
            raise ValueError("default_styles requires supports_styles")
        return self


def validate_default(name: str, value: Scalar, limit: ParameterLimit) -> None:
    if value is None:
        return
    if limit.options and value not in limit.options:
        raise ValueError(f"defaults.{name} must be in limits.{name}.options")
    if limit.min is None and limit.max is None:
        return
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        raise ValueError(f"defaults.{name} must be numeric")
    if limit.min is not None and value < limit.min:
        raise ValueError(f"defaults.{name} is below limits.{name}.min")
    if limit.max is not None and value > limit.max:
        raise ValueError(f"defaults.{name} exceeds limits.{name}.max")


class TaskDocument(CatalogModel):
    tasks: list[TaskDefinition] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_unique_tasks(self) -> Self:
        ids = [task.id for task in self.tasks]
        if len(ids) != len(set(ids)):
            raise ValueError("tasks.id must be unique")
        return self


class TaskView(TaskDefinition):
    available: bool
    unavailable_reason: str | None
    parameters: dict[str, ParameterSchema]
