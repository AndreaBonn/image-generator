from collections.abc import AsyncGenerator
from dataclasses import dataclass
from typing import Any, Literal, Protocol

from pydantic import BaseModel, ConfigDict

from app.engine.workflow_builder import Graph
from app.errors import AppError


class ImageReference(BaseModel):
    model_config = ConfigDict(frozen=True)
    filename: str
    subfolder: str
    type: Literal["output", "temp", "input"]


@dataclass(frozen=True, kw_only=True)
class Queued:
    prompt_id: str


@dataclass(frozen=True)
class Started:
    pass


@dataclass(frozen=True, kw_only=True)
class ModelSwitch:
    family: str
    eta_s: int


@dataclass(frozen=True, kw_only=True)
class Progress:
    step: int
    total: int


@dataclass(frozen=True, kw_only=True)
class PreviewImage:
    content: bytes
    media_type: Literal["image/jpeg", "image/png"]


@dataclass(frozen=True, kw_only=True)
class OutputImages:
    images: tuple[ImageReference, ...]


@dataclass(frozen=True, kw_only=True)
class Generated:
    images: tuple[bytes, ...]


@dataclass(frozen=True)
class Succeeded:
    pass


@dataclass(frozen=True)
class Interrupted:
    pass


@dataclass(frozen=True, kw_only=True)
class Failed:
    error: AppError


type EngineEvent = (
    Queued | Started | ModelSwitch | Progress | PreviewImage | Generated | Failed | Interrupted
)
type ParsedEvent = Started | Progress | OutputImages | Succeeded | Failed | Interrupted


@dataclass(frozen=True, kw_only=True)
class EngineRequest:
    graph: Graph
    family: str
    width: int
    height: int
    seed: int
    batch: int


class EngineClient(Protocol):
    async def system_stats(self) -> dict[str, Any]: ...
    async def upload_image(self, image: bytes, name: str) -> str: ...
    def run(self, request: EngineRequest) -> AsyncGenerator[EngineEvent, None]: ...
    async def interrupt(self) -> None: ...
    async def delete_from_queue(self, prompt_id: str) -> None: ...
    async def free(self) -> None: ...
