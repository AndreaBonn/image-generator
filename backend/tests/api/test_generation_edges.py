from pathlib import Path
from typing import Any

import pytest
from test_generations import generate
from test_jobs import JobApp
from test_jobs import job_app as job_app

from app.models.records import GenerationRecord


@pytest.mark.parametrize("path", ["image", "thumbnail"])
async def test_generation_rejects_external_symlink(
    job_app: JobApp, path: str, tmp_path: Path
) -> None:
    application, client = job_app
    generation_id = await generate(client=client)
    assert (await client.get(url=f"/api/v1/generations/{generation_id}/{path}")).status_code == 200
    with application.state.database.sessions() as session:
        record = session.get(entity=GenerationRecord, ident=generation_id)
    relative = record.image_path if path == "image" else record.thumb_path
    image = application.state.settings.data_dir / relative
    outside = tmp_path.parent / f"external-{generation_id}"
    outside.write_bytes(data=b"secret")
    image.unlink()
    image.symlink_to(target=outside)
    assert (await client.get(url=f"/api/v1/generations/{generation_id}/{path}")).status_code == 404
    assert outside.read_bytes() == b"secret"


@pytest.mark.parametrize("query", [{"page": 0}, {"per_page": 101}, {"per_page": 0}])
async def test_gallery_rejects_invalid_pagination(job_app: JobApp, query: dict[str, Any]) -> None:
    assert (await job_app[1].get(url="/api/v1/generations", params=query)).status_code == 422


async def test_gallery_literal_search_and_deleted_routes(job_app: JobApp) -> None:
    _, client = job_app
    generation_id = await generate(client=client, prompt="100% cat")
    await generate(client=client, prompt="cat")
    page = (await client.get(url="/api/v1/generations", params={"q": "%"})).json()
    assert page["meta"]["total"] == 1 and page["data"][0]["id"] == generation_id
    await client.delete(url=f"/api/v1/generations/{generation_id}")
    for suffix in ("", "/image", "/thumbnail"):
        assert (
            await client.get(url=f"/api/v1/generations/{generation_id}{suffix}")
        ).status_code == 404
    assert (
        await client.patch(url=f"/api/v1/generations/{generation_id}", json={"favorite": False})
    ).status_code == 404
    assert (
        await client.post(url=f"/api/v1/generations/{generation_id}/rerun", json={"new_seed": True})
    ).status_code == 404
    assert (await client.delete(url=f"/api/v1/generations/{generation_id}")).status_code == 404


async def test_rerun_of_rerun_and_header_validation(job_app: JobApp) -> None:
    from test_jobs import wait_terminal

    _, client = job_app
    generation_id = await generate(client=client)
    for _ in range(2):
        response = await client.post(
            url=f"/api/v1/generations/{generation_id}/rerun", json={"new_seed": False}
        )
        result = await wait_terminal(client=client, job_id=response.json()["data"]["job_id"])
        assert result["status"] == "completed"
        generation_id = result["generation_ids"][0]
    response = await client.post(
        url=f"/api/v1/generations/{generation_id}/rerun",
        json={"new_seed": True},
        headers={"Idempotency-Key": ""},
    )
    assert response.status_code == 422
