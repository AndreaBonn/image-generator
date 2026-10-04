import asyncio
from dataclasses import dataclass, field

from app.engine.types import EngineClient
from app.models.job import ResolvedJob


@dataclass(kw_only=True)
class JobRun:
    id: str
    job: ResolvedJob
    engine: EngineClient
    prompt_id: str | None = None
    is_running: bool = False
    is_cancelled: bool = False
    is_saving: bool = False
    task: asyncio.Task[None] | None = None
    completion_lock: asyncio.Lock = field(default_factory=asyncio.Lock)
