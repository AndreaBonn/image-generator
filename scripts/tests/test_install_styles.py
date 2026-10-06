import hashlib
from pathlib import Path

import pytest
from install_support import install

REAL_STYLES_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "styles"


def make_source(**overrides):
    files = overrides.pop("files", (install.StyleFile(filename="a.json", sha256="0" * 64),))
    base = {"repo": "lllyasviel/Fooocus", "commit": "deadbeef", "files": files}
    base.update(overrides)
    return install.StylesSource(**base)


def test_load_styles_source_reads_the_pinned_registry():
    source = install.load_styles_source()
    assert source.repo == "lllyasviel/Fooocus"
    assert len(source.files) == 6
    assert {f.filename for f in source.files} == {
        path.name for path in REAL_STYLES_DIR.glob("*.json")
    }


def test_style_raw_url_points_at_the_pinned_commit():
    source = make_source(commit="f2a21900c64c0bd4ed925420ea84e643f85d292b")
    url = install.style_raw_url(source=source, filename="sdxl_styles_sai.json")
    assert url == (
        "https://raw.githubusercontent.com/lllyasviel/Fooocus/"
        "f2a21900c64c0bd4ed925420ea84e643f85d292b/sdxl_styles/sdxl_styles_sai.json"
    )


def test_sync_style_file_downloads_when_missing(tmp_path, monkeypatch):
    content = b'[{"name": "Test"}]'
    digest = hashlib.sha256(content).hexdigest()
    style = install.StyleFile(filename="a.json", sha256=digest)
    source = make_source(files=(style,))
    monkeypatch.setattr(install, "fetch_bytes", lambda url: content)

    status = install.sync_style_file(style=style, source=source, destination_dir=tmp_path)

    assert status == "installed"
    assert (tmp_path / "a.json").read_bytes() == content


def test_sync_style_file_skips_identical_file_without_fetching(tmp_path, monkeypatch):
    content = b'[{"name": "Test"}]'
    digest = hashlib.sha256(content).hexdigest()
    style = install.StyleFile(filename="a.json", sha256=digest)
    source = make_source(files=(style,))
    (tmp_path / "a.json").write_bytes(content)

    def fail_if_called(url):
        raise AssertionError("no network call expected for an identical file")

    monkeypatch.setattr(install, "fetch_bytes", fail_if_called)

    status = install.sync_style_file(style=style, source=source, destination_dir=tmp_path)

    assert status == "skipped"


def test_sync_style_file_rejects_existing_mismatch_without_overwriting(tmp_path, monkeypatch):
    style = install.StyleFile(filename="a.json", sha256="f" * 64)
    source = make_source(files=(style,))
    (tmp_path / "a.json").write_bytes(b"local content, different from upstream")

    def fail_if_called(url):
        raise AssertionError("no network call expected before the local check")

    monkeypatch.setattr(install, "fetch_bytes", fail_if_called)

    with pytest.raises(install.StyleMismatchError, match="non toccato"):
        install.sync_style_file(style=style, source=source, destination_dir=tmp_path)

    assert (tmp_path / "a.json").read_bytes() == b"local content, different from upstream"


def test_sync_style_file_rejects_downloaded_content_with_wrong_hash(tmp_path, monkeypatch):
    style = install.StyleFile(filename="a.json", sha256="f" * 64)
    source = make_source(files=(style,))
    monkeypatch.setattr(install, "fetch_bytes", lambda url: b"not what was pinned")

    with pytest.raises(install.StyleMismatchError, match="non salvato"):
        install.sync_style_file(style=style, source=source, destination_dir=tmp_path)

    assert not (tmp_path / "a.json").exists()


def test_sync_styles_installs_all_six_real_style_files(tmp_path, monkeypatch):
    source = install.load_styles_source()
    real_bytes = {path.name: path.read_bytes() for path in REAL_STYLES_DIR.glob("*.json")}
    monkeypatch.setattr(
        install,
        "fetch_bytes",
        lambda url: real_bytes[url.rsplit("/", maxsplit=1)[-1]],
    )

    results = install.sync_styles(source=source, destination_dir=tmp_path)

    assert results == {filename: "installed" for filename in real_bytes}
    assert {p.name for p in tmp_path.glob("*.json")} == set(real_bytes)


def test_main_only_styles_creates_six_files(tmp_path, monkeypatch):
    source = install.load_styles_source()
    real_bytes = {path.name: path.read_bytes() for path in REAL_STYLES_DIR.glob("*.json")}
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setattr(
        install,
        "fetch_bytes",
        lambda url: real_bytes[url.rsplit("/", maxsplit=1)[-1]],
    )

    exit_code = install.main(["--only", "styles"])

    assert exit_code == 0
    created = list((tmp_path / "styles").glob("*.json"))
    assert len(created) == 6
    assert len(source.files) == 6
