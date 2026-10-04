import importlib.util
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parent.parent / "install_models.py"
spec = importlib.util.spec_from_file_location("install_models", SCRIPT)
install_models = importlib.util.module_from_spec(spec)
sys.modules["install_models"] = install_models
spec.loader.exec_module(install_models)

GB = install_models.GB


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


def test_has_room_true_when_margin_is_left():
    assert (
        install_models.has_room(free_bytes=10 * GB, size_bytes=4 * GB, min_free_gb=5)
        is True
    )


def test_has_room_true_at_exact_margin():
    assert (
        install_models.has_room(free_bytes=9 * GB, size_bytes=4 * GB, min_free_gb=5)
        is True
    )


def test_has_room_false_when_margin_would_be_eaten():
    assert (
        install_models.has_room(free_bytes=8 * GB, size_bytes=4 * GB, min_free_gb=5)
        is False
    )


def test_model_status_reports_installed_and_missing(tmp_path):
    paths = install_models.Paths(
        fooocus_dir=tmp_path / "fooocus", models_dir=tmp_path / "models"
    )
    entry = make_entry()
    assert install_models.model_status(entry, paths) == "missing"
    target = paths.models_dir / "loras" / "demo.safetensors"
    target.parent.mkdir(parents=True)
    target.write_bytes(b"x")
    assert install_models.model_status(entry, paths) == "installed"


def test_model_status_reads_fooocus_tree_for_reused_models(tmp_path):
    paths = install_models.Paths(
        fooocus_dir=tmp_path / "fooocus", models_dir=tmp_path / "models"
    )
    entry = make_entry(
        source="fooocus", folder="checkpoints", filename="jug.safetensors"
    )
    assert install_models.model_status(entry, paths) == "reused-missing"
    target = paths.fooocus_dir / "models" / "checkpoints" / "jug.safetensors"
    target.parent.mkdir(parents=True)
    target.write_bytes(b"x")
    assert install_models.model_status(entry, paths) == "reused"


def test_load_registry_rejects_huggingface_entry_without_hash(tmp_path):
    registry = tmp_path / "models.yaml"
    registry.write_text(
        "models:\n  - {id: a, label: A, family: sdxl, folder: loras, filename: a.st,"
        " source: huggingface, license: x, repo: o/a, repo_path: a.st}\n"
    )
    with pytest.raises(ValueError, match="sha256"):
        install_models.load_registry(registry)


def test_load_registry_parses_project_registry():
    entries = install_models.load_registry()
    ids = {e.id for e in entries}
    assert {"juggernaut_xl_v8", "flux2_klein_4b", "sdxl_lightning_lora"} <= ids


def test_remove_refuses_fooocus_models(tmp_path):
    paths = install_models.Paths(fooocus_dir=tmp_path, models_dir=tmp_path)
    with pytest.raises(SystemExit, match="never removed"):
        install_models.remove(make_entry(source="fooocus"), paths, assume_yes=True)


def test_sha256_of_matches_known_digest(tmp_path):
    sample = tmp_path / "sample.bin"
    sample.write_bytes(b"abc")
    expected = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    assert install_models.sha256_of(sample) == expected
