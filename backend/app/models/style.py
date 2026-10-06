from pydantic import BaseModel, ConfigDict, Field


class Style(BaseModel):
    model_config = ConfigDict(frozen=True)

    name: str = Field(min_length=1)
    prompt: str = "{prompt}"
    negative_prompt: str = ""
    source_file: str = ""


class StyleSummary(BaseModel):
    id: str
    name: str
    source_file: str
    preview_url: str | None = None


class StylesResponse(BaseModel):
    data: list[StyleSummary]
