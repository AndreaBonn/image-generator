from dataclasses import dataclass

from pydantic import BaseModel, ConfigDict, Field

from app.models.records import UploadRecord

MAX_RECIPE_PROMPT_LENGTH = 2000
MAX_RECIPE_STYLES = 5
MAX_RECIPE_SEED = 2**32 - 1


class UploadRecipeParams(BaseModel):
    model_config = ConfigDict(extra="ignore", strict=True, allow_inf_nan=False)

    aspect_ratio: str
    seed: int = Field(ge=0, le=MAX_RECIPE_SEED)
    style_ids: list[str] = Field(max_length=MAX_RECIPE_STYLES)
    steps: int
    cfg: float


class UploadRecipe(BaseModel):
    model_config = ConfigDict(extra="ignore", strict=True)

    task_id: str
    prompt: str = Field(max_length=MAX_RECIPE_PROMPT_LENGTH)
    negative_prompt: str = Field(max_length=MAX_RECIPE_PROMPT_LENGTH)
    params: UploadRecipeParams


@dataclass(frozen=True, kw_only=True)
class UploadResult:
    record: UploadRecord
    recipe: UploadRecipe | None
