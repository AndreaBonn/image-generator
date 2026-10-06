from typing import Any

import pytest
from test_generations import generate
from test_image_jobs import upload
from test_jobs import JobApp
from test_jobs import job_app as job_app

from app.errors import ValidationError
from app.models.job import JobRequest
from app.services.job_references import resolve_references


async def job_resources(job_app: JobApp) -> Any:
    application, _ = job_app
    return application.state.job_service.resources


async def test_resolve_references_returns_inputs_in_request_order(job_app: JobApp) -> None:
    _, client = job_app
    first_upload = await upload(client=client, size=(10, 10))
    generation_id = await generate(client=client)
    second_upload = await upload(client=client, size=(20, 20))

    request = JobRequest(
        task_id="crea_da_riferimenti",
        prompt="cat",
        references=[
            {"upload_id": first_upload},
            {"generation_id": generation_id},
            {"upload_id": second_upload},
        ],
    )
    images = resolve_references(request=request, resources=await job_resources(job_app=job_app))

    assert [image.size for image in images] == [(10, 10), (1152, 896), (20, 20)]
    assert images[0].parent_id is None
    assert images[1].parent_id == generation_id
    assert images[2].parent_id is None


async def test_resolve_references_rejects_unknown_generation(job_app: JobApp) -> None:
    _, client = job_app
    first_upload = await upload(client=client, size=(10, 10))
    request = JobRequest(
        task_id="crea_da_riferimenti",
        prompt="cat",
        references=[
            {"upload_id": first_upload},
            {"generation_id": "00000000-0000-0000-0000-000000000000"},
        ],
    )
    with pytest.raises(ValidationError) as error:
        resolve_references(request=request, resources=await job_resources(job_app=job_app))
    assert error.value.details[0]["field"] == "references"


async def test_resolve_references_rejects_unknown_upload(job_app: JobApp) -> None:
    request = JobRequest(
        task_id="crea_da_riferimenti",
        prompt="cat",
        references=[{"upload_id": "00000000-0000-0000-0000-000000000000"}],
    )
    with pytest.raises(ValidationError) as error:
        resolve_references(request=request, resources=await job_resources(job_app=job_app))
    assert error.value.details[0]["field"] == "references"


async def test_resolve_references_returns_empty_list_without_references(job_app: JobApp) -> None:
    request = JobRequest(task_id="crea_da_riferimenti", prompt="cat")
    images = resolve_references(request=request, resources=await job_resources(job_app=job_app))
    assert images == []
