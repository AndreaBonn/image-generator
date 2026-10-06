import httpx
from test_image_jobs import upload
from test_jobs import JobApp, wait_terminal
from test_jobs import job_app as job_app

from app.repositories.upload_repository import UploadRepository


async def generate_from_reference(client: httpx.AsyncClient, upload_id: str) -> str:
    response = await client.post(
        url="/api/v1/jobs",
        json={
            "task_id": "crea_da_riferimenti",
            "prompt": "cat",
            "references": [{"upload_id": upload_id}],
        },
    )
    result = await wait_terminal(client=client, job_id=response.json()["data"]["job_id"])
    assert result["status"] == "completed", result
    generation_id = result["generation_ids"][0]
    assert isinstance(generation_id, str)
    return generation_id


async def test_rerun_persists_and_reuses_references(job_app: JobApp) -> None:
    _, client = job_app
    reference_upload = await upload(client=client, size=(10, 10))
    generation_id = await generate_from_reference(client=client, upload_id=reference_upload)
    expected_references = [{"upload_id": reference_upload, "generation_id": None}]

    detail = await client.get(url=f"/api/v1/generations/{generation_id}")
    assert detail.json()["data"]["params"]["references"] == expected_references

    rerun = await client.post(
        url=f"/api/v1/generations/{generation_id}/rerun", json={"new_seed": True}
    )
    assert rerun.status_code == 202, rerun.text
    result = await wait_terminal(client=client, job_id=rerun.json()["data"]["job_id"])
    assert result["status"] == "completed", result
    assert result["request"]["references"] == expected_references


async def test_rerun_fails_with_validation_error_when_referenced_upload_is_gone(
    job_app: JobApp,
) -> None:
    application, client = job_app
    reference_upload = await upload(client=client, size=(10, 10))
    generation_id = await generate_from_reference(client=client, upload_id=reference_upload)
    UploadRepository(database=application.state.database).remove(upload_id=reference_upload)

    rerun = await client.post(
        url=f"/api/v1/generations/{generation_id}/rerun", json={"new_seed": True}
    )
    assert rerun.status_code == 422, rerun.text
    assert rerun.json()["error"]["details"][0]["field"] == "references"


async def test_reference_generation_parent_is_the_first_gallery_reference(
    job_app: JobApp,
) -> None:
    _, client = job_app
    gallery_parent = await generate_from_reference(
        client=client, upload_id=await upload(client=client, size=(10, 10))
    )
    response = await client.post(
        url="/api/v1/jobs",
        json={
            "task_id": "crea_da_riferimenti",
            "prompt": "cat",
            "references": [
                {"upload_id": await upload(client=client, size=(10, 10))},
                {"generation_id": gallery_parent},
            ],
        },
    )
    result = await wait_terminal(client=client, job_id=response.json()["data"]["job_id"])
    assert result["status"] == "completed", result

    detail = await client.get(url=f"/api/v1/generations/{result['generation_ids'][0]}")
    assert detail.json()["data"]["parent_id"] == gallery_parent


async def test_reference_generation_from_uploads_only_has_no_parent(job_app: JobApp) -> None:
    _, client = job_app
    generation_id = await generate_from_reference(
        client=client, upload_id=await upload(client=client, size=(10, 10))
    )

    detail = await client.get(url=f"/api/v1/generations/{generation_id}")
    assert detail.json()["data"]["parent_id"] is None
