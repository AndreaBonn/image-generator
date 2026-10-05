import pytest
from install_models_support import GB, fake_disk_usage, install_models, make_entry


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
    paths = install_models.Paths(models_dir=tmp_path / "models")
    entry = make_entry()
    assert install_models.model_status(entry, paths) == "missing"
    target = paths.models_dir / "loras" / "demo.safetensors"
    target.parent.mkdir(parents=True)
    target.write_bytes(b"x")
    assert install_models.model_status(entry, paths) == "installed"


def test_model_status_reads_own_tree_for_local_models(tmp_path):
    paths = install_models.Paths(models_dir=tmp_path / "models")
    entry = make_entry(source="local", folder="checkpoints", filename="jug.safetensors")
    assert install_models.model_status(entry, paths) == "missing"
    target = paths.models_dir / "checkpoints" / "jug.safetensors"
    target.parent.mkdir(parents=True)
    target.write_bytes(b"x")
    assert install_models.model_status(entry, paths) == "installed"


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


def test_remove_refuses_local_models(tmp_path):
    paths = install_models.Paths(models_dir=tmp_path)
    with pytest.raises(SystemExit, match="rimozione non consentita"):
        install_models.remove(make_entry(source="local"), paths, assume_yes=True)


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
    paths = install_models.Paths(models_dir=tmp_path / "models")
    paths.models_dir.mkdir(parents=True)
    monkeypatch.setattr(install_models.shutil, "disk_usage", fake_disk_usage(20 * GB))
    entries = [
        make_entry(id="with-size", size_bytes=2 * GB),
        make_entry(
            id="no-size",
            source="local",
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
    assert "missing" in no_size_line


def test_print_listing_marks_local_entry_as_installed_once_file_exists(
    tmp_path, monkeypatch, capsys
):
    paths = install_models.Paths(models_dir=tmp_path / "models")
    paths.models_dir.mkdir(parents=True)
    monkeypatch.setattr(install_models.shutil, "disk_usage", fake_disk_usage(20 * GB))
    entry = make_entry(
        id="reused-entry",
        source="local",
        folder="checkpoints",
        filename="reused.safetensors",
        size_bytes=0,
    )
    target = paths.models_dir / "checkpoints" / "reused.safetensors"
    target.parent.mkdir(parents=True)
    target.write_bytes(b"x")

    install_models.print_listing(entries=[entry], paths=paths)

    out = capsys.readouterr().out
    line = next(line for line in out.splitlines() if "reused-entry" in line)
    assert "installed" in line
