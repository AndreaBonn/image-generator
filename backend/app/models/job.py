from dataclasses import dataclass, field
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.image_input import ImageInput
from app.models.task import Scalar, TaskDefinition

MAX_SEED = 2**32 - 1
MAX_PROMPT_LENGTH = 2000
MAX_BATCH = 4


class JobParams(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    aspect_ratio: str | None = None
    seed: int | None = Field(default=None, ge=0, le=MAX_SEED, strict=True)
    batch: int = Field(default=1, ge=1, le=MAX_BATCH, strict=True)
    style_ids: list[str] | None = Field(default=None, max_length=5)
    steps: int | None = Field(default=None, gt=0, strict=True)
    cfg: float | None = Field(default=None, ge=0)


class JobRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    task_id: str
    prompt: str = Field(default="", max_length=MAX_PROMPT_LENGTH)
    negative_prompt: str = Field(default="", max_length=MAX_PROMPT_LENGTH)
    params: JobParams = Field(default_factory=JobParams)
    input_upload_id: UUID | None = None
    mask_upload_id: UUID | None = None
    source_generation_id: UUID | None = None
    outpaint_directions: list[Literal["top", "bottom", "left", "right"]] = Field(
        default_factory=list
    )
    upscale_factor: Literal[2, 4] | None = None


class ResolvedParams(BaseModel):
    model_config = ConfigDict(frozen=True)
    aspect_ratio: str
    width: int
    height: int
    seed: int
    batch: int
    steps: int
    cfg: float
    style_ids: list[str]


@dataclass(frozen=True, kw_only=True)
class ResolvedJob:
    request: JobRequest
    task: TaskDefinition
    params: ResolvedParams
    prompt_final: str
    negative_final: str
    image_input: ImageInput | None = None
    binding_values: dict[str, Scalar] = field(default_factory=dict)
