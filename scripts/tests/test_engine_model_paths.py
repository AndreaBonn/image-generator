import os
import subprocess
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]


def test_engine_generates_only_owned_model_paths(tmp_path: Path) -> None:
    template = ROOT / "config/comfy/extra_model_paths.yaml.template"
    config = tmp_path / "config/comfy"
    config.mkdir(parents=True)
    (config / template.name).write_text(template.read_text(), encoding="utf-8")
    engine = tmp_path / "engine"
    engine.mkdir()
    script = (ROOT / "engine/install_engine.sh").read_text()
    function = script.split("write_model_paths() {", maxsplit=1)[1].split("\n}\n", maxsplit=1)[0]
    command = "set -eu\nlog() { :; }\nwrite_model_paths() {" + function + "\n}\nwrite_model_paths"
    env = dict(
        os.environ,
        REPO_ROOT=str(tmp_path),
        ENGINE_DIR=str(engine),
        MODELS_DIR=str(tmp_path / "models"),
    )
    env.pop("FOOOCUS_DIR", None)
    subprocess.run(args=["bash", "-c", command], env=env, check=True, capture_output=True)
    result = yaml.safe_load((engine / "extra_model_paths.yaml").read_text())
    assert list(result) == ["studio"]
    assert result["studio"]["base_path"] == str(tmp_path / "models")
    assert (tmp_path / "models/inpaint").is_dir()
