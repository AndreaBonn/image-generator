"""Regression test against the real template (not a synthetic one), so a change
to config/comfy/extra_model_paths.yaml.template that breaks the generated file
is caught here, not just by the synthetic-template unit test in
test_install_engine.py.
"""

import importlib.util
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]

_spec = importlib.util.spec_from_file_location(
    "install_engine", ROOT / "engine" / "install_engine.py"
)
install_engine = importlib.util.module_from_spec(_spec)
sys.modules["install_engine"] = install_engine
_spec.loader.exec_module(install_engine)


def test_engine_generates_only_owned_model_paths(tmp_path: Path) -> None:
    template = ROOT / "config/comfy/extra_model_paths.yaml.template"
    engine_dir = tmp_path / "engine"
    engine_dir.mkdir()
    models_dir = tmp_path / "models"

    install_engine.execute_write_model_paths(engine_dir, models_dir, template)

    result = yaml.safe_load((engine_dir / "extra_model_paths.yaml").read_text())
    assert list(result) == ["studio"]
    assert result["studio"]["base_path"] == str(models_dir)
    assert (models_dir / "inpaint").is_dir()
