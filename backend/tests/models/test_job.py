import pytest
from pydantic import ValidationError

from app.models.job import JobRequest, ReferenceInput


def test_reference_input_rejects_neither_upload_nor_generation_id() -> None:
    with pytest.raises(ValidationError, match="exactly one of upload_id"):
        ReferenceInput.model_validate({})


def test_reference_input_rejects_both_upload_and_generation_id() -> None:
    with pytest.raises(ValidationError, match="exactly one of upload_id"):
        ReferenceInput.model_validate(
            {"upload_id": "b3f2e2b0-1111-4a11-8a11-111111111111"}
            | {"generation_id": "a91c1a1a-2222-4a22-8a22-222222222222"}
        )


def test_reference_input_accepts_upload_id_only() -> None:
    reference = ReferenceInput.model_validate({"upload_id": "b3f2e2b0-1111-4a11-8a11-111111111111"})
    assert reference.generation_id is None


def test_job_request_references_defaults_to_none() -> None:
    request = JobRequest(task_id="crea_da_riferimenti")
    assert request.references is None
