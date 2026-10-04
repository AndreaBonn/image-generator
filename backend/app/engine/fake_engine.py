import asyncio
from collections.abc import AsyncGenerator
from io import BytesIO
from uuid import uuid4

from PIL import Image, ImageDraw

from app.engine.types import (
    EngineEvent,
    EngineRequest,
    Generated,
    Interrupted,
    ModelSwitch,
    Progress,
    Queued,
    Started,
)

FAKE_STEPS = 4
FAKE_STEP_DELAY_S = 0.02


def render_image(width: int, height: int, seed: int) -> bytes:
    image = Image.new(mode="RGB", size=(width, height), color="#294359")
    ImageDraw.Draw(im=image).text(xy=(10, 10), text=f"Seed: {seed}", fill="white")
    output = BytesIO()
    image.save(fp=output, format="PNG")
    return output.getvalue()


class FakeEngine:
    def __init__(
        self, step_delay_s: float = FAKE_STEP_DELAY_S, model_switch_eta_s: int = 10
    ) -> None:
        self.step_delay_s = step_delay_s
        self.model_switch_eta_s = model_switch_eta_s
        self.family: str | None = None
        self.is_interrupted = False
        self.deleted: set[str] = set()

    async def run(self, request: EngineRequest) -> AsyncGenerator[EngineEvent, None]:
        prompt_id = str(uuid4())
        self.is_interrupted = False
        yield Queued(prompt_id=prompt_id)
        await asyncio.sleep(delay=self.step_delay_s)
        if prompt_id in self.deleted:
            self.deleted.remove(prompt_id)
            yield Interrupted()
            return
        if self.family != request.family:
            yield ModelSwitch(family=request.family, eta_s=self.model_switch_eta_s)
        yield Started()
        for step in range(1, FAKE_STEPS + 1):
            await asyncio.sleep(delay=self.step_delay_s)
            if self.is_interrupted:
                yield Interrupted()
                return
            yield Progress(step=step, total=FAKE_STEPS)
        images = [
            await asyncio.to_thread(
                render_image, width=request.width, height=request.height, seed=request.seed
            )
            for _ in range(request.batch)
        ]
        self.family = request.family
        yield Generated(images=tuple(images))

    async def interrupt(self) -> None:
        self.is_interrupted = True

    async def delete_from_queue(self, prompt_id: str) -> None:
        self.deleted.add(prompt_id)

    async def free(self) -> None:
        self.family = None
