import dataclasses
import json
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Any, cast

import pytest
import yaml
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.examples import router as examples_router
from app.config import REPO_ROOT, Settings
from app.errors import AppError, handle_app_error
from app.models.records import GenerationRecord, JobRecord, utc_now
from app.models.task import TaskView
from app.repositories.asset_repository import AssetRepository, atomic_write_bytes
from app.repositories.database import Database
from app.repositories.generation_repository import GenerationRepository
from app.repositories.job_repository import JobRepository
from app.services.asset_generation import plan_examples
from app.services.generation_service import GenerationService
from app.services.task_catalog import load_catalog

# Same model set as tests/services/test_asset_generation.py's EXAMPLE_MODEL_IDS: enough
# installed models for plan_examples to have real "crea" candidates without references.
EXAMPLE_MODEL_IDS = {
    "juggernaut_xl_v8",
    "sdxl_lightning_lora",
    "sdxl_offset_lora",
    "flux2_klein_4b",
    "qwen3_4b_fp4",
    "flux2_vae",
    "zimage_turbo",
    "zimage_vae",
}

read_yaml = cast(Callable[[str], object], yaml.safe_load)


def _copy_catalog_config(tmp_path: Path) -> Path:
    config_dir = tmp_path / "config"
    config_dir.mkdir()
    for name in ("tasks.yaml", "models.yaml"):
        (config_dir / name).write_text(
            (REPO_ROOT / "config" / name).read_text(encoding="utf-8"), encoding="utf-8"
        )
    return config_dir


def _touch_models(settings: Settings, model_ids: set[str]) -> None:
    models = cast(
        dict[str, list[dict[str, str]]],
        read_yaml((settings.config_dir / "models.yaml").read_text(encoding="utf-8")),
    )
    for model in models["models"]:
        if model["id"] not in model_ids:
            continue
        path = settings.models_dir / model["folder"] / model["filename"]
        path.parent.mkdir(parents=True, exist_ok=True)
        path.touch()


@pytest.fixture
def available_example_tasks(tmp_path: Path) -> Sequence[TaskView]:
    """TaskView list where bozza/qualita/testo/foto are available, giving
    plan_examples real candidates to filter (mirrors test_asset_generation.py).
    """
    settings = Settings(
        config_dir=_copy_catalog_config(tmp_path),
        workflows_dir=REPO_ROOT / "workflows",
        styles_dir=tmp_path / "styles",
        models_dir=tmp_path / "models",
    )
    _touch_models(settings=settings, model_ids=EXAMPLE_MODEL_IDS)
    return load_catalog(settings=settings).list_tasks()


class FakeCatalog:
    """Stand-in for `TaskCatalog`: only `list_tasks()` is used by the route."""

    def __init__(self, tasks: Sequence[TaskView]) -> None:
        self._tasks = tasks

    def list_tasks(self) -> Sequence[TaskView]:
        return self._tasks


def make_client(tmp_path: Path, tasks: Sequence[TaskView]) -> tuple[TestClient, Database]:
    database = Database(data_dir=tmp_path / "db")
    database.migrate()
    app = FastAPI()
    app.add_exception_handler(AppError, handle_app_error)
    app.state.asset_repository = AssetRepository(data_dir=tmp_path / "data")
    app.state.task_catalog = FakeCatalog(tasks=tasks)
    app.state.generation_service = GenerationService(
        repository=GenerationRepository(database=database),
        jobs=JobRepository(database=database),
        data_dir=tmp_path / "data",
    )
    app.include_router(router=examples_router, prefix="/api/v1")
    return TestClient(app=app), database


def write_manifest(repository: AssetRepository, entries: list[Any]) -> None:
    repository.examples_dir.mkdir(parents=True, exist_ok=True)
    atomic_write_bytes(
        path=repository.examples_dir / "manifest.json",
        content=json.dumps(entries, ensure_ascii=False).encode("utf-8"),
    )


def add_trashed_generation(database: Database) -> None:
    with database.sessions.begin() as session:
        session.add(JobRecord(id="job-1", task_id="bozza", status="completed", request={}))
    with database.sessions.begin() as session:
        session.add(
            GenerationRecord(
                id="gen-1",
                job_id="job-1",
                task_id="bozza",
                model_ids=["x"],
                prompt="p",
                negative_prompt="",
                prompt_final="p",
                params={},
                seed=1,
                width=512,
                height=512,
                image_path="a.png",
                thumb_path="a.webp",
                duration_ms=1,
                deleted_at=utc_now(),
            )
        )


def test_empty_gallery_is_first_use(tmp_path: Path) -> None:
    client, _ = make_client(tmp_path=tmp_path, tasks=[])

    response = client.get(url="/api/v1/examples")

    assert response.status_code == 200
    assert response.json() == {"data": {"first_use": True, "examples": []}}


def test_trashed_generation_is_not_first_use(tmp_path: Path) -> None:
    client, database = make_client(tmp_path=tmp_path, tasks=[])
    add_trashed_generation(database=database)

    response = client.get(url="/api/v1/examples")

    assert response.json()["data"]["first_use"] is False


def test_manifest_entry_without_file_is_excluded(
    tmp_path: Path, available_example_tasks: Sequence[TaskView]
) -> None:
    repository = AssetRepository(data_dir=tmp_path / "data")
    plan = plan_examples(tasks=available_example_tasks)[0]
    write_manifest(repository=repository, entries=[dataclasses.asdict(plan)])
    # No image written for the plan's file: the entry must be excluded.

    client, _ = make_client(tmp_path=tmp_path, tasks=available_example_tasks)
    response = client.get(url="/api/v1/examples")

    assert response.json()["data"]["examples"] == []


def test_malformed_manifest_entries_are_skipped_not_a_500(
    tmp_path: Path, available_example_tasks: Sequence[TaskView]
) -> None:
    repository = AssetRepository(data_dir=tmp_path / "data")
    plan = plan_examples(tasks=available_example_tasks)[0]
    (repository.examples_dir).mkdir(parents=True, exist_ok=True)
    (repository.examples_dir / plan.file).write_bytes(b"webp")
    good = dataclasses.asdict(plan)
    no_file = {key: value for key, value in good.items() if key != "file"}
    write_manifest(repository=repository, entries=[1, "x", None, no_file, good])

    client, _ = make_client(tmp_path=tmp_path, tasks=available_example_tasks)
    response = client.get(url="/api/v1/examples")

    assert response.status_code == 200
    assert [entry["id"] for entry in response.json()["data"]["examples"]] == [plan.id]


def test_manifest_entry_with_file_is_served(
    tmp_path: Path, available_example_tasks: Sequence[TaskView]
) -> None:
    repository = AssetRepository(data_dir=tmp_path / "data")
    plan = plan_examples(tasks=available_example_tasks)[0]
    write_manifest(repository=repository, entries=[dataclasses.asdict(plan)])
    atomic_write_bytes(path=repository.examples_dir / plan.file, content=b"webp-bytes")

    client, _ = make_client(tmp_path=tmp_path, tasks=available_example_tasks)
    examples = client.get(url="/api/v1/examples").json()["data"]["examples"]

    assert examples == [
        {
            "id": plan.id,
            "task_id": plan.task_id,
            "prompt": plan.prompt,
            "seed": plan.seed,
            "aspect_ratio": plan.aspect_ratio,
            "width": plan.width,
            "height": plan.height,
            "image_url": f"/api/v1/examples/{plan.id}/image",
        }
    ]
    image = client.get(url=examples[0]["image_url"])
    assert image.status_code == 200
    assert image.content == b"webp-bytes"
    assert image.headers["content-type"] == "image/webp"


def test_example_image_404_on_traversal_or_invalid_id(tmp_path: Path) -> None:
    client, _ = make_client(tmp_path=tmp_path, tasks=[])

    assert client.get(url="/api/v1/examples/..%2F..%2Fetc%2Fpasswd/image").status_code == 404
    assert client.get(url="/api/v1/examples/not-hex/image").status_code == 404
    assert client.get(url="/api/v1/examples/0123456789abcdef/image").status_code == 404
