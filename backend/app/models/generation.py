from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.job import JobRequest


class RerunJobRequest(JobRequest):
    rerun_generation_id: UUID


class GalleryQuery(BaseModel):
    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=24, ge=1, le=100)
    task_id: str | None = None
    q: str | None = None
    favorite: bool | None = None


class GenerationSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    task_id: str
    prompt: str
    seed: int
    width: int
    height: int
    favorite: bool
    created_at: datetime
    parent_id: str | None


class FavoriteUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    favorite: bool = Field(strict=True)


class RerunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    new_seed: bool = Field(strict=True)
