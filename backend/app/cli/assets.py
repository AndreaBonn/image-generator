"""CLI entry point: `uv run python -m app.cli.assets {styles,examples}`.

`styles` generates the style preview thumbnails that `AssetRepository` is still missing,
one at a time, printing progress and an ETA derived from the styles already done.
`examples` generates the Crea page's first-use examples (AS-P11): two per available
"crea" task without references, writing `DATA_DIR/examples/manifest.json` and skipping
any image already on disk.
"""

import argparse
import asyncio
import sys
from collections.abc import AsyncIterator, Awaitable, Callable, Sequence
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from time import monotonic

import httpx

from app.config import Settings
from app.engine.comfy_client import ComfyClient
from app.engine.comfy_engine import ComfyEngine
from app.engine.types import EngineClient
from app.errors import EngineUnavailableError
from app.services.asset_runs import generate_missing_examples, generate_missing_previews

ENGINE_HTTP_TIMEOUT_S = 30

EngineFactory = Callable[[Settings], AbstractAsyncContextManager[EngineClient]]


@asynccontextmanager
async def default_engine_factory(settings: Settings) -> AsyncIterator[EngineClient]:
    async with httpx.AsyncClient(
        base_url=settings.comfy_url, timeout=ENGINE_HTTP_TIMEOUT_S, trust_env=False
    ) as http:
        yield ComfyEngine(client=ComfyClient(http=http, config=settings), url=settings.comfy_url)


def _parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="python -m app.cli.assets")
    subparsers = parser.add_subparsers(dest="command", required=True)
    styles_parser = subparsers.add_parser("styles", help="Genera le anteprime stile mancanti.")
    styles_parser.add_argument(
        "--limit", type=int, default=None, help="Genera al massimo N anteprime."
    )
    subparsers.add_parser("examples", help="Genera gli esempi mancanti per Crea.")
    return parser.parse_args(argv)


def _format_progress(index: int, total: int, style_name: str, durations: list[float]) -> str:
    remaining = total - index
    average_s = sum(durations) / len(durations)
    eta_min = round(remaining * average_s / 60)
    return f"{index}/{total} · {style_name} · tempo stimato rimanente {eta_min} min"


class PreviewPrinter:
    """Prints one line per preview with an ETA from the previews already done."""

    def __init__(self) -> None:
        self.durations: list[float] = []
        self.last_at = monotonic()

    def started(self, total: int) -> None:
        if total == 0:
            print("Tutte le anteprime richieste sono già presenti.")
        self.last_at = monotonic()

    def advanced(self, done: int, total: int, label: str) -> None:
        now = monotonic()
        self.durations.append(now - self.last_at)
        self.last_at = now
        print(_format_progress(index=done, total=total, style_name=label, durations=self.durations))


class ExamplePrinter:
    def started(self, total: int) -> None:
        if total == 0:
            print("Nessun esempio da generare.")

    def advanced(self, done: int, total: int, label: str) -> None:
        print(f"{done}/{total} · {label} · esempio generato")


async def _run_checked(
    settings: Settings,
    engine_factory: EngineFactory,
    action: Callable[[EngineClient], Awaitable[int]],
) -> int:
    async with engine_factory(settings) as engine:
        try:
            await engine.system_stats()
        except EngineUnavailableError as error:
            print(str(error), file=sys.stderr)
            return 1
        return await action(engine)


async def _run_styles_command(
    settings: Settings, engine_factory: EngineFactory, limit: int | None
) -> int:
    async def action(engine: EngineClient) -> int:
        await generate_missing_previews(
            settings=settings, engine=engine, progress=PreviewPrinter(), limit=limit
        )
        return 0

    return await _run_checked(settings=settings, engine_factory=engine_factory, action=action)


async def _run_examples_command(settings: Settings, engine_factory: EngineFactory) -> int:
    async def action(engine: EngineClient) -> int:
        await generate_missing_examples(settings=settings, engine=engine, progress=ExamplePrinter())
        return 0

    return await _run_checked(settings=settings, engine_factory=engine_factory, action=action)


def run(argv: Sequence[str], engine_factory: EngineFactory | None = None) -> int:
    args = _parse_args(argv)
    settings = Settings()
    factory = engine_factory if engine_factory is not None else default_engine_factory
    try:
        if args.command == "examples":
            coroutine = _run_examples_command(settings=settings, engine_factory=factory)
        else:
            coroutine = _run_styles_command(
                settings=settings, engine_factory=factory, limit=args.limit
            )
        return asyncio.run(coroutine)
    except KeyboardInterrupt:
        print("\nInterrotto: nessuna anteprima parziale è stata salvata.", file=sys.stderr)
        return 130


def main() -> None:
    sys.exit(run(sys.argv[1:]))


if __name__ == "__main__":
    main()
