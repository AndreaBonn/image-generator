import hashlib
import importlib.util
import sys
from collections import namedtuple
from pathlib import Path

import huggingface_hub
import pytest

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


def test_load_registry_rejects_entry_with_unknown_source(tmp_path):
    registry = tmp_path / "models.yaml"
    registry.write_text(
        "models:\n  - {id: a, label: A, family: sdxl, folder: loras, filename: a.st,"
        " source: dropbox, license: x}\n"
    )
    with pytest.raises(ValueError, match="unknown source"):
        install_models.load_registry(registry)


def test_find_entry_returns_the_entry_with_matching_id():
    entries = [make_entry(id="alpha"), make_entry(id="beta")]
    found = install_models.find_entry(entries, "beta")
    assert found.id == "beta"


def test_find_entry_unknown_id_raises_systemexit_listing_known_ids():
    entries = [make_entry(id="alpha"), make_entry(id="beta")]
    with pytest.raises(
        SystemExit, match="Unknown model id 'ghost'. Known ids: alpha, beta"
    ):
        install_models.find_entry(entries, "ghost")


def test_print_listing_shows_free_space_and_every_entry(tmp_path, monkeypatch, capsys):
    paths = install_models.Paths(
        fooocus_dir=tmp_path / "fooocus", models_dir=tmp_path / "models"
    )
    paths.models_dir.mkdir(parents=True)
    monkeypatch.setattr(install_models.shutil, "disk_usage", fake_disk_usage(20 * GB))
    entries = [
        make_entry(id="with-size", size_bytes=2 * GB),
        make_entry(
            id="no-size",
            source="fooocus",
            folder="checkpoints",
            filename="reused.safetensors",
            size_bytes=0,
        ),
    ]

    install_models.print_listing(entries=entries, paths=paths)

    out = capsys.readouterr().out
    assert "Free disk space: 20.0 GB" in out
    for column in ("id", "family", "status", "GB", "enabled", "license"):
        assert column in out
    with_size_line = next(line for line in out.splitlines() if "with-size" in line)
    assert "2.00" in with_size_line
    assert "missing" in with_size_line
    no_size_line = next(line for line in out.splitlines() if "no-size" in line)
    assert "-" in no_size_line
    assert "reused-missing" in no_size_line


def test_print_listing_marks_fooocus_entry_as_reused_once_file_exists(
    tmp_path, monkeypatch, capsys
):
    paths = install_models.Paths(
        fooocus_dir=tmp_path / "fooocus", models_dir=tmp_path / "models"
    )
    paths.models_dir.mkdir(parents=True)
    monkeypatch.setattr(install_models.shutil, "disk_usage", fake_disk_usage(20 * GB))
    entry = make_entry(
        id="reused-entry",
        source="fooocus",
        folder="checkpoints",
        filename="reused.safetensors",
        size_bytes=0,
    )
    target = paths.fooocus_dir / "models" / "checkpoints" / "reused.safetensors"
    target.parent.mkdir(parents=True)
    target.write_bytes(b"x")

    install_models.print_listing(entries=[entry], paths=paths)

    out = capsys.readouterr().out
    line = next(line for line in out.splitlines() if "reused-entry" in line)
    assert "reused" in line and "reused-missing" not in line


def test_download_skips_and_does_not_call_hf_hub_download_when_already_installed(
    tmp_path, monkeypatch, capsys
):
    paths = install_models.Paths(
        fooocus_dir=tmp_path / "fooocus", models_dir=tmp_path / "models"
    )
    entry = make_entry()
    destination = install_models.target_path(entry, paths)
    destination.parent.mkdir(parents=True)
    destination.write_bytes(b"already here")

    def refuse_to_download(**_kwargs):
        raise AssertionError(
            "hf_hub_download must not be called when already installed"
        )

    monkeypatch.setattr(huggingface_hub, "hf_hub_download", refuse_to_download)

    install_models.download(entry=entry, paths=paths, min_free_gb=5)

    out = capsys.readouterr().out
    assert f"{entry.id}: already installed at {destination}" in out
    assert destination.read_bytes() == b"already here"


def test_download_refuses_when_disk_space_would_drop_below_margin(
    tmp_path, monkeypatch
):
    paths = install_models.Paths(
        fooocus_dir=tmp_path / "fooocus", models_dir=tmp_path / "models"
    )
    paths.models_dir.mkdir(parents=True)
    entry = make_entry(size_bytes=4 * GB)
    monkeypatch.setattr(
        install_models.shutil, "disk_usage", fake_disk_usage(8 * GB)
    )  # 8 - 4 = 4 GB left, below the 5 GB margin

    def refuse_to_download(**_kwargs):
        raise AssertionError("hf_hub_download must not be called without enough room")

    monkeypatch.setattr(huggingface_hub, "hf_hub_download", refuse_to_download)

    with pytest.raises(SystemExit, match="not enough space"):
        install_models.download(entry=entry, paths=paths, min_free_gb=5)

    assert not install_models.target_path(entry, paths).is_file()


def test_download_verifies_sha256_and_moves_file_into_place_on_match(
    tmp_path, monkeypatch, capsys
):
    paths = install_models.Paths(
        fooocus_dir=tmp_path / "fooocus", models_dir=tmp_path / "models"
    )
    paths.models_dir.mkdir(parents=True)
    content = b"integration-bytes-for-sha-check"
    entry = make_entry(sha256=hashlib.sha256(content).hexdigest())
    monkeypatch.setattr(install_models.shutil, "disk_usage", fake_disk_usage(20 * GB))

    def fake_hf_hub_download(*, repo_id, filename, local_dir):
        staged = Path(local_dir) / filename
        staged.parent.mkdir(parents=True, exist_ok=True)
        staged.write_bytes(content)
        return str(staged)

    monkeypatch.setattr(huggingface_hub, "hf_hub_download", fake_hf_hub_download)

    install_models.download(entry=entry, paths=paths, min_free_gb=5)

    destination = install_models.target_path(entry, paths)
    assert destination.read_bytes() == content
    staged_path = paths.models_dir / install_models.DOWNLOAD_STAGING / entry.filename
    assert not staged_path.is_file()
    out = capsys.readouterr().out
    assert f"{entry.id}: installed at {destination}" in out


def test_download_removes_staged_file_and_raises_on_sha256_mismatch(
    tmp_path, monkeypatch
):
    paths = install_models.Paths(
        fooocus_dir=tmp_path / "fooocus", models_dir=tmp_path / "models"
    )
    paths.models_dir.mkdir(parents=True)
    entry = make_entry(sha256="f" * 64)
    monkeypatch.setattr(install_models.shutil, "disk_usage", fake_disk_usage(20 * GB))

    def fake_hf_hub_download(*, repo_id, filename, local_dir):
        staged = Path(local_dir) / filename
        staged.parent.mkdir(parents=True, exist_ok=True)
        staged.write_bytes(b"content that will not match the expected hash")
        return str(staged)

    monkeypatch.setattr(huggingface_hub, "hf_hub_download", fake_hf_hub_download)

    with pytest.raises(SystemExit, match="sha256 mismatch"):
        install_models.download(entry=entry, paths=paths, min_free_gb=5)

    staged_path = paths.models_dir / install_models.DOWNLOAD_STAGING / entry.filename
    assert not staged_path.is_file()
    assert not install_models.target_path(entry, paths).is_file()


def test_remove_reports_not_installed_when_file_is_missing(tmp_path, capsys):
    paths = install_models.Paths(fooocus_dir=tmp_path, models_dir=tmp_path)
    entry = make_entry()

    install_models.remove(entry=entry, paths=paths, assume_yes=True)

    out = capsys.readouterr().out
    assert f"{entry.id}: not installed" in out
    assert not install_models.target_path(entry, paths).is_file()


def test_remove_deletes_without_prompt_when_assume_yes_is_true(tmp_path, capsys):
    paths = install_models.Paths(fooocus_dir=tmp_path, models_dir=tmp_path)
    entry = make_entry()
    destination = install_models.target_path(entry, paths)
    destination.parent.mkdir(parents=True)
    destination.write_bytes(b"x")

    install_models.remove(entry=entry, paths=paths, assume_yes=True)

    assert not destination.is_file()
    assert f"{entry.id}: removed" in capsys.readouterr().out


def test_remove_prompts_and_aborts_when_answer_is_not_yes(
    tmp_path, monkeypatch, capsys
):
    paths = install_models.Paths(fooocus_dir=tmp_path, models_dir=tmp_path)
    entry = make_entry()
    destination = install_models.target_path(entry, paths)
    destination.parent.mkdir(parents=True)
    destination.write_bytes(b"x")
    monkeypatch.setattr("builtins.input", lambda prompt: "n")

    install_models.remove(entry=entry, paths=paths, assume_yes=False)

    assert destination.is_file()
    assert "Aborted" in capsys.readouterr().out


def test_remove_prompts_and_deletes_when_answer_is_yes(tmp_path, monkeypatch, capsys):
    paths = install_models.Paths(fooocus_dir=tmp_path, models_dir=tmp_path)
    entry = make_entry()
    destination = install_models.target_path(entry, paths)
    destination.parent.mkdir(parents=True)
    destination.write_bytes(b"x")
    monkeypatch.setattr("builtins.input", lambda prompt: "y")

    install_models.remove(entry=entry, paths=paths, assume_yes=False)

    assert not destination.is_file()
    assert f"{entry.id}: removed" in capsys.readouterr().out


def test_build_parser_requires_one_action():
    with pytest.raises(SystemExit) as excinfo:
        install_models.build_parser().parse_args([])
    assert excinfo.value.code == 2


def test_build_parser_rejects_combining_list_and_install():
    with pytest.raises(SystemExit) as excinfo:
        install_models.build_parser().parse_args(["--list", "--install", "foo"])
    assert excinfo.value.code == 2


def test_build_parser_remove_requires_at_least_one_id():
    with pytest.raises(SystemExit) as excinfo:
        install_models.build_parser().parse_args(["--remove"])
    assert excinfo.value.code == 2


def test_build_parser_install_accepts_multiple_ids():
    args = install_models.build_parser().parse_args(["--install", "a", "b"])
    assert args.install == ["a", "b"]
    assert args.yes is False


def test_main_list_prints_entries_and_creates_models_dir(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("FOOOCUS_DIR", str(tmp_path / "fooocus"))
    monkeypatch.setenv("MODELS_DIR", str(tmp_path / "brand-new-models"))
    monkeypatch.setattr(install_models.shutil, "disk_usage", fake_disk_usage(20 * GB))
    monkeypatch.setattr(
        install_models, "load_registry", lambda: [make_entry(id="demo1")]
    )

    exit_code = install_models.main(["--list"])

    assert exit_code == 0
    assert "demo1" in capsys.readouterr().out
    assert (tmp_path / "brand-new-models").is_dir()


def test_main_install_named_id_dispatches_download_only_for_that_entry(
    tmp_path, monkeypatch
):
    monkeypatch.setenv("FOOOCUS_DIR", str(tmp_path / "fooocus"))
    monkeypatch.setenv("MODELS_DIR", str(tmp_path / "models"))
    monkeypatch.setattr(
        install_models,
        "load_registry",
        lambda: [make_entry(id="alpha"), make_entry(id="beta")],
    )
    calls = []
    monkeypatch.setattr(
        install_models, "download", lambda **kwargs: calls.append(kwargs["entry"].id)
    )

    exit_code = install_models.main(["--install", "alpha"])

    assert exit_code == 0
    assert calls == ["alpha"]


def test_main_install_unknown_id_raises_systemexit(tmp_path, monkeypatch):
    monkeypatch.setenv("FOOOCUS_DIR", str(tmp_path / "fooocus"))
    monkeypatch.setenv("MODELS_DIR", str(tmp_path / "models"))
    monkeypatch.setattr(
        install_models, "load_registry", lambda: [make_entry(id="alpha")]
    )

    with pytest.raises(SystemExit, match="Unknown model id 'ghost'"):
        install_models.main(["--install", "ghost"])


def test_main_install_explicit_fooocus_id_skips_download(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("FOOOCUS_DIR", str(tmp_path / "fooocus"))
    monkeypatch.setenv("MODELS_DIR", str(tmp_path / "models"))
    monkeypatch.setattr(
        install_models,
        "load_registry",
        lambda: [
            make_entry(
                id="reused",
                source="fooocus",
                folder="checkpoints",
                filename="j.safetensors",
                size_bytes=0,
            )
        ],
    )

    def refuse_to_download(**_kwargs):
        raise AssertionError("download must not be called for a fooocus-sourced model")

    monkeypatch.setattr(install_models, "download", refuse_to_download)

    exit_code = install_models.main(["--install", "reused"])

    assert exit_code == 0
    assert "reused: reused from Fooocus, nothing to download" in capsys.readouterr().out


def test_main_install_enabled_selects_only_enabled_huggingface_entries(
    tmp_path, monkeypatch
):
    monkeypatch.setenv("FOOOCUS_DIR", str(tmp_path / "fooocus"))
    monkeypatch.setenv("MODELS_DIR", str(tmp_path / "models"))
    monkeypatch.setattr(
        install_models,
        "load_registry",
        lambda: [
            make_entry(id="hf-on", enabled=True),
            make_entry(id="hf-off", enabled=False),
            make_entry(
                id="fo",
                source="fooocus",
                folder="checkpoints",
                filename="f.safetensors",
                size_bytes=0,
                enabled=True,
            ),
        ],
    )
    calls = []
    monkeypatch.setattr(
        install_models, "download", lambda **kwargs: calls.append(kwargs["entry"].id)
    )

    exit_code = install_models.main(["--install-enabled"])

    assert exit_code == 0
    assert calls == ["hf-on"]


def test_main_remove_dispatches_for_each_id_with_yes_flag_as_assume_yes(
    tmp_path, monkeypatch
):
    monkeypatch.setenv("FOOOCUS_DIR", str(tmp_path / "fooocus"))
    monkeypatch.setenv("MODELS_DIR", str(tmp_path / "models"))
    monkeypatch.setattr(
        install_models,
        "load_registry",
        lambda: [make_entry(id="r1"), make_entry(id="r2")],
    )
    calls = []
    monkeypatch.setattr(
        install_models,
        "remove",
        lambda **kwargs: calls.append((kwargs["entry"].id, kwargs["assume_yes"])),
    )

    exit_code = install_models.main(["--remove", "r1", "r2", "--yes"])

    assert exit_code == 0
    assert calls == [("r1", True), ("r2", True)]


def test_main_remove_without_yes_flag_passes_assume_yes_false(tmp_path, monkeypatch):
    monkeypatch.setenv("FOOOCUS_DIR", str(tmp_path / "fooocus"))
    monkeypatch.setenv("MODELS_DIR", str(tmp_path / "models"))
    monkeypatch.setattr(install_models, "load_registry", lambda: [make_entry(id="r1")])
    calls = []
    monkeypatch.setattr(
        install_models,
        "remove",
        lambda **kwargs: calls.append((kwargs["entry"].id, kwargs["assume_yes"])),
    )

    exit_code = install_models.main(["--remove", "r1"])

    assert exit_code == 0
    assert calls == [("r1", False)]
