import hashlib
import importlib.util
import sys
from pathlib import Path
from types import ModuleType

import pytest
import yaml

SCRIPT = Path(__file__).resolve().parents[1] / "migrate_from_fooocus.py"


@pytest.fixture
def migration(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> ModuleType:
    spec = importlib.util.spec_from_file_location("migrate_from_fooocus", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    registry = tmp_path / "models.yaml"
    entry = {
        "id": "demo",
        "source": "local",
        "fooocus_migratable": True,
        "folder": "checkpoints",
        "filename": "demo.bin",
        "size_bytes": 3,
        "sha256": hashlib.sha256(b"abc").hexdigest(),
    }
    registry.write_text(yaml.safe_dump({"models": [entry]}), encoding="utf-8")
    monkeypatch.setattr(module, "REGISTRY_PATH", registry)
    monkeypatch.setenv("FOOOCUS_DIR", str(tmp_path / "fooocus"))
    monkeypatch.setenv("MODELS_DIR", str(tmp_path / "models"))
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    source = tmp_path / "fooocus/models/checkpoints/demo.bin"
    source.parent.mkdir(parents=True)
    source.write_bytes(b"abc")
    styles = tmp_path / "fooocus/sdxl_styles"
    styles.mkdir()
    (styles / "test.json").write_text('[{"name":"Test"}]', encoding="utf-8")
    return module
