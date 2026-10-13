from contextlib import nullcontext
from pathlib import Path

from app.config import Settings
from app.engine.fake_engine import FakeEngine
from app.services.asset_jobs import AssetJobs


def _asset_jobs(tmp_path: Path) -> AssetJobs:
    config = Settings(engine_mode="fake", data_dir=tmp_path, styles_dir=tmp_path / "styles")
    return AssetJobs(settings=config, gpu_turn=nullcontext)


async def test_cancel_right_after_start_ends_the_run_and_frees_the_slot(tmp_path: Path) -> None:
    jobs = _asset_jobs(tmp_path=tmp_path)
    jobs.start(kind="styles", engine=FakeEngine(step_delay_s=0))

    await jobs.cancel()

    assert jobs.snapshot()["status"] == "cancelled"
    jobs.start(kind="examples", engine=FakeEngine(step_delay_s=0))
    assert jobs.snapshot() == {
        "kind": "examples",
        "status": "running",
        "done": 0,
        "total": 0,
        "message": None,
    }
    await jobs.cancel()
