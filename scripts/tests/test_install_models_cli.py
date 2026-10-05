
import pytest
from install_models_support import GB, fake_disk_usage, install_models, make_entry


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
    monkeypatch.setenv("MODELS_DIR", str(tmp_path / "models"))
    monkeypatch.setattr(
        install_models, "load_registry", lambda: [make_entry(id="alpha")]
    )

    with pytest.raises(SystemExit, match="Unknown model id 'ghost'"):
        install_models.main(["--install", "ghost"])


def test_main_install_explicit_local_id_refuses_download(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("MODELS_DIR", str(tmp_path / "models"))
    monkeypatch.setattr(
        install_models,
        "load_registry",
        lambda: [
            make_entry(
                id="reused",
                source="local",
                folder="checkpoints",
                filename="j.safetensors",
                size_bytes=0,
            )
        ],
    )

    with pytest.raises(SystemExit, match="modello locale.*migra"):
        install_models.main(["--install", "reused"])


def test_main_install_enabled_selects_only_enabled_huggingface_entries(
    tmp_path, monkeypatch
):
    monkeypatch.setenv("MODELS_DIR", str(tmp_path / "models"))
    monkeypatch.setattr(
        install_models,
        "load_registry",
        lambda: [
            make_entry(id="hf-on", enabled=True),
            make_entry(id="hf-off", enabled=False),
            make_entry(
                id="fo",
                source="local",
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
