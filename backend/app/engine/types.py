from collections.abc import AsyncGenerator
from dataclasses import dataclass
from typing import Literal, Protocol

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
    preview_url: str | None = None


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


type EngineEvent = Queued | Started | ModelSwitch | Progress | Generated | Failed | Interrupted
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
    def run(self, request: EngineRequest) -> AsyncGenerator[EngineEvent, None]: ...
    async def interrupt(self) -> None: ...
    async def delete_from_queue(self, prompt_id: str) -> None: ...
    async def free(self) -> None: ...
