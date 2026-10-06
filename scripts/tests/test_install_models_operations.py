import hashlib
from pathlib import Path

import huggingface_hub
import pytest
from install_models_support import GB, fake_disk_usage, install_models, make_entry


def test_download_skips_and_does_not_call_hf_hub_download_when_already_installed(
    tmp_path, monkeypatch, capsys
):
    paths = install_models.Paths(
        models_dir=tmp_path / "models"
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
        models_dir=tmp_path / "models"
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
        models_dir=tmp_path / "models"
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
        models_dir=tmp_path / "models"
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
    paths = install_models.Paths(models_dir=tmp_path)
    entry = make_entry()

    install_models.remove(entry=entry, paths=paths, assume_yes=True)

    out = capsys.readouterr().out
    assert f"{entry.id}: not installed" in out
    assert not install_models.target_path(entry, paths).is_file()


def test_remove_deletes_without_prompt_when_assume_yes_is_true(tmp_path, capsys):
    paths = install_models.Paths(models_dir=tmp_path)
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
    paths = install_models.Paths(models_dir=tmp_path)
    entry = make_entry()
    destination = install_models.target_path(entry, paths)
    destination.parent.mkdir(parents=True)
    destination.write_bytes(b"x")
    monkeypatch.setattr("builtins.input", lambda prompt: "n")

    install_models.remove(entry=entry, paths=paths, assume_yes=False)

    assert destination.is_file()
    assert "Aborted" in capsys.readouterr().out


def test_remove_prompts_and_deletes_when_answer_is_yes(tmp_path, monkeypatch, capsys):
    paths = install_models.Paths(models_dir=tmp_path)
    entry = make_entry()
    destination = install_models.target_path(entry, paths)
    destination.parent.mkdir(parents=True)
    destination.write_bytes(b"x")
    monkeypatch.setattr("builtins.input", lambda prompt: "y")

    install_models.remove(entry=entry, paths=paths, assume_yes=False)

    assert not destination.is_file()
    assert f"{entry.id}: removed" in capsys.readouterr().out


def test_remove_juggernaut_on_real_registry_keeps_file_without_y_and_removes_with_y(
    tmp_path, monkeypatch, capsys
):
    """Regression guard for T002: juggernaut_xl_v8 moved from source: local (removal
    always refused) to source: huggingface (removal needs the generic 'y' prompt,
    same as every other Hugging Face model)."""
    entries = install_models.load_registry()
    entry = install_models.find_entry(entries, "juggernaut_xl_v8")
    assert entry.source == "huggingface"
    paths = install_models.Paths(models_dir=tmp_path)
    destination = install_models.target_path(entry, paths)
    destination.parent.mkdir(parents=True)
    destination.write_bytes(b"fake-juggernaut-weights")

    monkeypatch.setattr("builtins.input", lambda prompt: "n")
    install_models.remove(entry=entry, paths=paths, assume_yes=False)
    assert destination.is_file()
    assert "Aborted" in capsys.readouterr().out

    monkeypatch.setattr("builtins.input", lambda prompt: "y")
    install_models.remove(entry=entry, paths=paths, assume_yes=False)
    assert not destination.is_file()
    assert f"{entry.id}: removed" in capsys.readouterr().out


