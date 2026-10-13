import json
from collections.abc import AsyncGenerator, AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import pytest

from app.cli.assets import run
from app.config import Settings
from app.engine.fake_engine import FakeEngine
from app.engine.types import EngineClient, EngineEvent, EngineRequest
from app.errors import EngineUnavailableError
from app.repositories.asset_repository import AssetRepository

STYLE_NAMES = ["Alpha", "Bravo", "Charlie"]


@pytest.fixture(autouse=True)
def _repo_dirs(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, placeholder_models_dir: Path
) -> None:
    """Point DATA_DIR/STYLES_DIR/MODELS_DIR at a scratch tree so tests never touch the repo."""
    styles_dir = tmp_path / "styles"
    styles_dir.mkdir()
    entries = [{"name": name} for name in STYLE_NAMES]
    (styles_dir / "a.json").write_text(json.dumps(entries), encoding="utf-8")
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("STYLES_DIR", str(styles_dir))
    monkeypatch.setenv("MODELS_DIR", str(placeholder_models_dir))


def _asset_repository() -> AssetRepository:
    return AssetRepository(data_dir=Settings().data_dir)


def _fake_factory(engine: EngineClient) -> Any:
    @asynccontextmanager
    async def factory(settings: Settings) -> AsyncIterator[EngineClient]:
        yield engine

    return factory


class DownEngine(FakeEngine):
    async def system_stats(self) -> dict[str, Any]:
        raise EngineUnavailableError()


class InterruptingEngine(FakeEngine):
    async def run(self, request: EngineRequest) -> AsyncGenerator[EngineEvent, None]:
        raise KeyboardInterrupt()
        yield  # pragma: no cover - makes this an async generator


def test_run_exits_1_with_message_when_engine_is_down(capsys: pytest.CaptureFixture[str]) -> None:
    exit_code = run(["styles"], engine_factory=_fake_factory(DownEngine(step_delay_s=0)))

    assert exit_code == 1
    assert "non risponde" in capsys.readouterr().err


def test_run_generates_only_the_missing_styles() -> None:
    repository = _asset_repository()
    repository.save(style_name="Alpha", content=b"already-there")

    exit_code = run(["styles"], engine_factory=_fake_factory(FakeEngine(step_delay_s=0)))

    assert exit_code == 0
    assert all(repository.exists(style_name=name) for name in STYLE_NAMES)


def test_run_limit_caps_how_many_previews_are_generated() -> None:
    repository = _asset_repository()

    exit_code = run(
        ["styles", "--limit", "1"], engine_factory=_fake_factory(FakeEngine(step_delay_s=0))
    )

    assert exit_code == 0
    assert sum(repository.exists(style_name=name) for name in STYLE_NAMES) == 1


def test_run_prints_progress_with_eta(capsys: pytest.CaptureFixture[str]) -> None:
    run(["styles", "--limit", "1"], engine_factory=_fake_factory(FakeEngine(step_delay_s=0)))

    out = capsys.readouterr().out
    assert "1/1" in out
    assert "tempo stimato rimanente" in out


def test_run_on_keyboard_interrupt_exits_130_and_saves_nothing_partial() -> None:
    repository = _asset_repository()

    exit_code = run(["styles"], engine_factory=_fake_factory(InterruptingEngine(step_delay_s=0)))

    assert exit_code == 130
    assert all(not repository.exists(style_name=name) for name in STYLE_NAMES)


class CountingEngine(FakeEngine):
    def __init__(self) -> None:
        super().__init__(step_delay_s=0)
        self.run_calls = 0

    async def run(self, request: EngineRequest) -> AsyncGenerator[EngineEvent, None]:
        self.run_calls += 1
        async for event in super().run(request=request):
            yield event


EXAMPLE_TASK_IDS = {"bozza", "qualita", "testo", "foto"}


def _examples_manifest() -> list[dict[str, Any]]:
    path = Settings().data_dir / "examples" / "manifest.json"
    manifest: list[dict[str, Any]] = json.loads(path.read_text(encoding="utf-8"))
    return manifest


def test_run_examples_exits_1_with_message_when_engine_is_down(
    capsys: pytest.CaptureFixture[str],
) -> None:
    exit_code = run(["examples"], engine_factory=_fake_factory(DownEngine(step_delay_s=0)))

    assert exit_code == 1
    assert "non risponde" in capsys.readouterr().err


def test_run_examples_writes_two_entries_per_available_crea_task() -> None:
    exit_code = run(["examples"], engine_factory=_fake_factory(FakeEngine(step_delay_s=0)))

    assert exit_code == 0
    manifest = _examples_manifest()
    counts: dict[str, int] = {}
    for entry in manifest:
        counts[entry["task_id"]] = counts.get(entry["task_id"], 0) + 1
    assert set(counts) == EXAMPLE_TASK_IDS
    assert all(count == 2 for count in counts.values())


def test_run_examples_writes_the_image_file_for_every_manifest_entry() -> None:
    run(["examples"], engine_factory=_fake_factory(FakeEngine(step_delay_s=0)))

    examples_dir = Settings().data_dir / "examples"
    for entry in _examples_manifest():
        assert {
            "id",
            "task_id",
            "prompt",
            "seed",
            "aspect_ratio",
            "width",
            "height",
            "file",
        } <= set(entry)
        assert (examples_dir / entry["file"]).is_file()


def test_run_examples_second_run_does_not_regenerate_existing_images() -> None:
    run(["examples"], engine_factory=_fake_factory(FakeEngine(step_delay_s=0)))
    counting_engine = CountingEngine()

    exit_code = run(["examples"], engine_factory=_fake_factory(counting_engine))

    assert exit_code == 0
    assert counting_engine.run_calls == 0
