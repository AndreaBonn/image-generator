import pytest
from pydantic import ValidationError

from app.repositories.catalog_repository import ModelDocument, ModelEntry

BASE_ENTRY = {
    "id": "model",
    "label": "Model",
    "source": "local",
    "folder": "checkpoints",
    "filename": "model.safetensors",
}


@pytest.mark.parametrize(
    "field,value",
    [
        ("folder", "/etc"),
        ("filename", "/etc/passwd"),
        ("folder", "../outside"),
        ("filename", "a/../../outside.bin"),
    ],
)
def test_model_entry_rejects_absolute_or_traversal_paths(field: str, value: str) -> None:
    with pytest.raises(ValidationError, match="must be a relative path"):
        ModelEntry.model_validate({**BASE_ENTRY, field: value})


def test_model_entry_accepts_plain_relative_path() -> None:
    entry = ModelEntry.model_validate(BASE_ENTRY)
    assert entry.folder == "checkpoints" and entry.filename == "model.safetensors"


def test_model_document_rejects_duplicate_model_ids() -> None:
    with pytest.raises(ValidationError, match="models.id must be unique"):
        ModelDocument.model_validate({"models": [BASE_ENTRY, BASE_ENTRY]})


def test_model_document_accepts_distinct_model_ids() -> None:
    other = {**BASE_ENTRY, "id": "other"}
    document = ModelDocument.model_validate({"models": [BASE_ENTRY, other]})
    assert [model.id for model in document.models] == ["model", "other"]


def test_model_entry_exposes_huggingface_fields_for_download() -> None:
    entry = ModelEntry.model_validate(
        {
            **BASE_ENTRY,
            "source": "huggingface",
            "repo": "Kim2091/UltraSharp",
            "repo_path": "4x-UltraSharp.safetensors",
            "sha256": "36a340b5509b699d2c06cb445ddc1d3d39199ac734d889ed6d7915f60e05bcbc",
        }
    )
    assert entry.repo == "Kim2091/UltraSharp"
    assert entry.repo_path == "4x-UltraSharp.safetensors"
    assert entry.sha256 == "36a340b5509b699d2c06cb445ddc1d3d39199ac734d889ed6d7915f60e05bcbc"


def test_model_entry_huggingface_fields_default_to_none() -> None:
    entry = ModelEntry.model_validate(BASE_ENTRY)
    assert entry.repo is None
    assert entry.repo_path is None
    assert entry.sha256 is None
