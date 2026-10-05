import importlib.util
import sys
from collections import namedtuple
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "install_models.py"
spec = importlib.util.spec_from_file_location("install_models", SCRIPT)
install_models = importlib.util.module_from_spec(spec)
sys.modules["install_models"] = install_models
spec.loader.exec_module(install_models)

GB = install_models.GB

_DiskUsage = namedtuple("_DiskUsage", "total used free")


def fake_disk_usage(free_bytes):
    """Build a shutil.disk_usage replacement reporting a fixed free amount."""

    def _disk_usage(path):
        return _DiskUsage(total=0, used=0, free=free_bytes)

    return _disk_usage


def make_entry(**overrides):
    base = {
        "id": "demo",
        "label": "Demo",
        "family": "sdxl",
        "folder": "loras",
        "filename": "demo.safetensors",
        "source": "huggingface",
        "license": "apache-2.0",
        "repo": "org/demo",
        "repo_path": "demo.safetensors",
        "size_bytes": 2 * GB,
        "sha256": "0" * 64,
    }
    base.update(overrides)
    return install_models.ModelEntry(**base)


