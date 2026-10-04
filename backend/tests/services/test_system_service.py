from pathlib import Path

from app.config import Settings
from app.services.system_service import model_status
from app.services.task_catalog import load_catalog


def test_model_status_covers_new_and_reused_models(tmp_path: Path) -> None:
    config = Settings(
        data_dir=tmp_path, models_dir=tmp_path / "models", fooocus_dir=tmp_path / "fooocus"
    )
    catalog = load_catalog(settings=config)
    for model_id, missing, installed in [
        ("ultrasharp_4x", "missing", "installed"),
        ("juggernaut_xl_v8", "reused-missing", "reused"),
    ]:
        model = catalog.models[model_id]
        assert model_status(model=model, catalog=catalog)["status"] == missing
        root = config.models_dir if model.source == "huggingface" else config.fooocus_dir / "models"
        path = root / model.folder / model.filename
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data=b"weights")
        result = model_status(model=model, catalog=catalog)
        assert result["status"] == installed and result["size_gb"] > 0
        assert result["license"] == model.license and result["enabled"] == model.enabled
    assert model_status(model=catalog.models["zimage_turbo"], catalog=catalog)["enabled"] is False
