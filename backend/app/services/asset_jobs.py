import asyncio
import logging
from dataclasses import asdict, dataclass, replace
from typing import Any, Literal

from app.config import Settings
from app.engine.types import EngineClient
from app.errors import AppError, AssetGenerationInProgressError
from app.services.asset_runs import GpuTurn, generate_missing_examples, generate_missing_previews

logger = logging.getLogger(__name__)

AssetKind = Literal["examples", "styles"]
AssetStatus = Literal["idle", "running", "completed", "failed", "cancelled"]


@dataclass(frozen=True)
class AssetGenerationState:
    kind: AssetKind | None = None
    status: AssetStatus = "idle"
    done: int = 0
    total: int = 0
    message: str | None = None


class AssetJobs:
    """The single, app-wide run that creates examples or style previews (I4).

    The UI polls `snapshot()`; one run at a time, a second `start()` raises a 409.
    State lives in memory only: a restart forgets it, while finished images stay on disk.
    """

    def __init__(self, settings: Settings, gpu_turn: GpuTurn) -> None:
        self.settings = settings
        self.gpu_turn = gpu_turn
        self.state = AssetGenerationState()
        self.task: asyncio.Task[None] | None = None

    def snapshot(self) -> dict[str, Any]:
        return asdict(self.state)

    def started(self, total: int) -> None:
        self.state = replace(self.state, total=total)

    def advanced(self, done: int, total: int, label: str) -> None:
        self.state = replace(self.state, done=done, total=total)

    def start(self, kind: AssetKind, engine: EngineClient) -> None:
        if self.task is not None:
            raise AssetGenerationInProgressError()
        self.state = AssetGenerationState(kind=kind, status="running")
        self.task = asyncio.create_task(
            coro=self._run(kind=kind, engine=engine), name=f"asset-generation-{kind}"
        )

    async def _generate(self, kind: AssetKind, engine: EngineClient) -> None:
        generate = generate_missing_examples if kind == "examples" else generate_missing_previews
        await generate(settings=self.settings, engine=engine, progress=self, gpu_turn=self.gpu_turn)

    async def _run(self, kind: AssetKind, engine: EngineClient) -> None:
        try:
            await self._generate(kind=kind, engine=engine)
            self.state = replace(self.state, status="completed")
        except asyncio.CancelledError:
            self.state = replace(self.state, status="cancelled")
            raise
        except AppError as error:
            logger.warning("Asset generation %s failed: %s", kind, error.code)
            self.state = replace(self.state, status="failed", message=error.message)
        except Exception:
            # Background-task boundary: without a terminal status the UI would poll forever.
            logger.exception("Unexpected error while generating %s", kind)
            self.state = replace(self.state, status="failed", message=AppError.default_message)
        finally:
            self.task = None

    async def cancel(self) -> None:
        """No-op when nothing runs."""
        task = self.task
        if task is None:
            return
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
