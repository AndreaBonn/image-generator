from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]
FOOOCUS_DEFAULT = Path.home() / "Fooocus"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=REPO_ROOT / ".env", env_file_encoding="utf-8", extra="ignore", frozen=True
    )

    comfy_url: str = "http://127.0.0.1:8188"
    engine_mode: Literal["comfy", "fake"] = "comfy"
    fooocus_dir: Path = FOOOCUS_DEFAULT
    models_dir: Path = REPO_ROOT / "engine/models"
    comfy_output_dir: Path = REPO_ROOT / "engine/ComfyUI/output"
    data_dir: Path = REPO_ROOT / "data"
    workflows_dir: Path = REPO_ROOT / "workflows"
    config_dir: Path = REPO_ROOT / "config"
    min_free_disk_gb: float = Field(default=5, ge=0)
    job_timeout_s: int = Field(default=600, gt=0)
    # Benchmark 2026-10-04: first image after a family switch took 5-14 s on the RTX 4060.
    model_switch_eta_s: int = Field(default=10, ge=0)
    host: Literal["127.0.0.1"] = "127.0.0.1"
    port: int = Field(default=8000, ge=1, le=65535)

    @field_validator("comfy_url")
    @classmethod
    def validate_engine_url(cls, value: str) -> str:
        url = urlsplit(url=value)
        if (
            url.scheme != "http"
            or url.hostname != "127.0.0.1"
            or url.username
            or url.password
            or url.query
            or url.fragment
            or url.path not in ("", "/")
        ):
            raise ValueError("COMFY_URL must be an HTTP URL on 127.0.0.1")
        if url.port is not None and url.port < 1:
            raise ValueError("COMFY_URL port must be positive")
        return value.rstrip("/")


settings = Settings()
