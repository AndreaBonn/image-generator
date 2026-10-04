import json
from pathlib import Path

import pytest

from app.repositories.style_repository import load_styles


def test_load_styles_files_excludes_expansion_and_defaults_prompt(tmp_path: Path) -> None:
    for index in range(6):
        entries = [{"name": f"Style {index}", "negative_prompt": "blur"}]
        if index == 0:
            entries.append({"name": "Fooocus V2", "prompt": "{prompt}"})
        (tmp_path / f"styles_{index}.json").write_text(json.dumps(entries), encoding="utf-8")
    styles = load_styles(directory=tmp_path)
    assert len(styles) == 6
    assert styles[0].name == "Style 0"
    assert styles[0].prompt == "{prompt}"
    assert styles[0].source_file == "styles_0.json"
    assert "Fooocus V2" not in [style.name for style in styles]


def test_load_styles_missing_directory_returns_empty_catalog(tmp_path: Path) -> None:
    assert load_styles(directory=tmp_path / "missing") == ()
    (tmp_path / "valid.json").write_text('[{"name":"Style"}]', encoding="utf-8")
    assert len(load_styles(directory=tmp_path)) == 1


@pytest.mark.parametrize("content", ['{"name":"Style"}', '[{"prompt":"text"}]', "["])
def test_load_styles_malformed_file_rejects(tmp_path: Path, content: str) -> None:
    (tmp_path / "invalid.json").write_text(content, encoding="utf-8")
    with pytest.raises(ValueError):
        load_styles(directory=tmp_path)


def test_load_styles_duplicate_name_across_files_rejects(tmp_path: Path) -> None:
    (tmp_path / "styles_0.json").write_text(
        json.dumps([{"name": "Photo", "negative_prompt": "blur"}]), encoding="utf-8"
    )
    (tmp_path / "styles_1.json").write_text(
        json.dumps([{"name": "Photo", "negative_prompt": "noise"}]), encoding="utf-8"
    )
    with pytest.raises(ValueError, match="Duplicate style name: Photo"):
        load_styles(directory=tmp_path)
