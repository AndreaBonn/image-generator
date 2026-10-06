from install_support import install_detect


def test_engine_installed_true_when_main_py_present(tmp_path):
    (tmp_path / "ComfyUI").mkdir()
    (tmp_path / "ComfyUI" / "main.py").write_text("x")

    assert install_detect.engine_installed(tmp_path) is True


def test_engine_installed_false_when_absent(tmp_path):
    assert install_detect.engine_installed(tmp_path) is False


def test_backend_deps_installed_true_when_venv_dir_present(tmp_path):
    (tmp_path / ".venv").mkdir()

    assert install_detect.backend_deps_installed(tmp_path) is True


def test_backend_deps_installed_false_when_absent(tmp_path):
    assert install_detect.backend_deps_installed(tmp_path) is False


def test_frontend_built_true_when_dist_index_present(tmp_path):
    (tmp_path / "dist").mkdir()
    (tmp_path / "dist" / "index.html").write_text("<html></html>")

    assert install_detect.frontend_built(tmp_path) is True


def test_frontend_built_false_when_absent(tmp_path):
    assert install_detect.frontend_built(tmp_path) is False


class _Style:
    def __init__(self, filename, sha256):
        self.filename = filename
        self.sha256 = sha256


class _Source:
    def __init__(self, files):
        self.files = files


def test_missing_style_filenames_flags_absent_file(tmp_path):
    source = _Source([_Style("a.json", "deadbeef")])

    missing = install_detect.missing_style_filenames(
        source=source, destination_dir=tmp_path, digest_fn=lambda path: "unused"
    )

    assert missing == ("a.json",)


def test_missing_style_filenames_flags_hash_mismatch(tmp_path):
    (tmp_path / "a.json").write_text("local content")
    source = _Source([_Style("a.json", "expected-digest")])

    missing = install_detect.missing_style_filenames(
        source=source, destination_dir=tmp_path, digest_fn=lambda path: "different-digest"
    )

    assert missing == ("a.json",)


def test_missing_style_filenames_empty_when_identical(tmp_path):
    (tmp_path / "a.json").write_text("local content")
    source = _Source([_Style("a.json", "matching-digest")])

    missing = install_detect.missing_style_filenames(
        source=source, destination_dir=tmp_path, digest_fn=lambda path: "matching-digest"
    )

    assert missing == ()


class _ModelEntry:
    def __init__(self, id, enabled=True, source="huggingface"):
        self.id = id
        self.enabled = enabled
        self.source = source


def test_missing_enabled_model_ids_includes_missing_enabled_huggingface():
    entries = [_ModelEntry("a"), _ModelEntry("b")]

    missing = install_detect.missing_enabled_model_ids(
        entries=entries, status_fn=lambda entry: "missing"
    )

    assert missing == ("a", "b")


def test_missing_enabled_model_ids_skips_disabled():
    entries = [_ModelEntry("a", enabled=False)]

    missing = install_detect.missing_enabled_model_ids(
        entries=entries, status_fn=lambda entry: "missing"
    )

    assert missing == ()


def test_missing_enabled_model_ids_skips_installed():
    entries = [_ModelEntry("a")]

    missing = install_detect.missing_enabled_model_ids(
        entries=entries, status_fn=lambda entry: "installed"
    )

    assert missing == ()


def test_missing_enabled_model_ids_skips_non_huggingface_source():
    entries = [_ModelEntry("a", source="local")]

    missing = install_detect.missing_enabled_model_ids(
        entries=entries, status_fn=lambda entry: "missing"
    )

    assert missing == ()
