from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.tasks import router
from app.config import REPO_ROOT, Settings
from app.services.task_catalog import load_catalog


def test_list_tasks_returns_groups_guidance_parameters_and_availability(tmp_path: Path) -> None:
    settings = Settings(
        config_dir=REPO_ROOT / "config",
        workflows_dir=REPO_ROOT / "workflows",
        models_dir=tmp_path / "models",
        fooocus_dir=tmp_path / "fooocus",
    )
    app = FastAPI()
    app.state.task_catalog = load_catalog(settings=settings)
    app.include_router(router=router, prefix="/api/v1")
    with TestClient(app=app) as client:
        response = client.get(url="/api/v1/tasks")
    assert response.status_code == 200
    data = response.json()
    assert data["meta"]["groups"] == [
        {"id": "crea", "label": "Crea"},
        {"id": "modifica", "label": "Modifica"},
        {"id": "migliora", "label": "Migliora"},
    ]
    assert len(data["data"]) == 9
    draft = data["data"][0]
    assert draft["available"] is False
    assert "Modelli non installati" in draft["unavailable_reason"]
    assert draft["parameters"]["steps"] == {"default": 4, "min": 2, "max": 8, "options": []}
    assert draft["prompt_language"]["label"] == "Scrivi in inglese"
    assert len(draft["parameters"]["aspect_ratio"]["options"]) == 26


def test_list_tasks_matches_frontend_contract(tmp_path: Path) -> None:
    """Frontend reads aspect_ratios[].value and default_aspect_ratio (frontend/src/api/types.ts)."""
    settings = Settings(
        config_dir=REPO_ROOT / "config",
        workflows_dir=REPO_ROOT / "workflows",
        models_dir=tmp_path / "models",
        fooocus_dir=tmp_path / "fooocus",
    )
    app = FastAPI()
    app.state.task_catalog = load_catalog(settings=settings)
    app.include_router(router=router, prefix="/api/v1")
    with TestClient(app=app) as client:
        tasks = client.get(url="/api/v1/tasks").json()["data"]
    bozza = next(task for task in tasks if task["id"] == "bozza")
    values = [ratio["value"] for ratio in bozza["aspect_ratios"]]
    assert "1152*896" in values
    assert len(set(values)) == len(values)
    assert bozza["default_aspect_ratio"] == "1152*896"
