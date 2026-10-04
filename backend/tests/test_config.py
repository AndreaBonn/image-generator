from pathlib import Path

import pytest
from pydantic import ValidationError

from app.config import REPO_ROOT, Settings


def test_settings_defaults_match_repository() -> None:
    settings = Settings(_env_file=None)
    assert settings.comfy_url == "http://127.0.0.1:8188"
    assert settings.host == "127.0.0.1"
    assert settings.port == 8000
    assert settings.engine_mode == "comfy"
    assert settings.models_dir == REPO_ROOT / "engine/models"
    assert settings.comfy_output_dir == REPO_ROOT / "engine/ComfyUI/output"
    assert settings.data_dir == REPO_ROOT / "data"
    assert settings.workflows_dir == REPO_ROOT / "workflows"
    assert settings.config_dir == REPO_ROOT / "config"
    assert settings.job_timeout_s == 600
    assert settings.min_free_disk_gb == 5


def test_settings_read_environment_and_dotenv(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    dotenv = tmp_path / ".env"
    dotenv.write_text("PORT=8123\nENGINE_MODE=fake\n", encoding="utf-8")
    monkeypatch.setenv("MODELS_DIR", str(tmp_path))
    settings = Settings(_env_file=dotenv)
    assert settings.models_dir == tmp_path
    assert settings.port == 8123
    assert settings.engine_mode == "fake"


@pytest.mark.parametrize(
    "field,value",
    [
        ("host", "0.0.0.0"),
        ("port", 0),
        ("port", 65536),
        ("engine_mode", "other"),
        ("job_timeout_s", 0),
        ("min_free_disk_gb", -1),
        ("comfy_url", "https://example.com"),
    ],
)
def test_settings_invalid_values_fail(field: str, value: object) -> None:
    with pytest.raises(ValidationError, match=field):
        Settings.model_validate({field: value})
