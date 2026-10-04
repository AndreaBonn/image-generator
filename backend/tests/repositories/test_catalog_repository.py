import pytest
from pydantic import ValidationError

from app.repositories.catalog_repository import ModelDocument, ModelEntry

BASE_ENTRY = {
    "id": "model",
    "label": "Model",
    "source": "fooocus",
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
