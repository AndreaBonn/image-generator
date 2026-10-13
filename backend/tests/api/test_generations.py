import asyncio

import httpx
import pytest
from test_jobs import JobApp, wait_terminal
from test_jobs import job_app as job_app

from app.models.records import GenerationRecord


async def generate(client: httpx.AsyncClient, prompt: str = "cat", seed: int = 42) -> str:
    response = await client.post(
        url="/api/v1/jobs",
        json={
            "task_id": "bozza",
            "prompt": prompt,
            "params": {"seed": seed},
        },
    )
    result = await wait_terminal(client=client, job_id=response.json()["data"]["job_id"])
    assert result["status"] == "completed", result
    generation_id = result["generation_ids"][0]
    assert isinstance(generation_id, str)
    return generation_id


async def test_gallery_filters_pages_favorites_and_soft_delete(job_app: JobApp) -> None:
    application, client = job_app
    first = await generate(client=client)
    second = await generate(client=client, prompt="dog")
    response = await client.get(url="/api/v1/generations", params={"per_page": 1})
    assert response.status_code == 200
    assert response.json()["meta"] == {"page": 1, "per_page": 1, "total": 2, "total_pages": 2}
    assert response.json()["data"][0]["id"] == second
    updated = await client.patch(url=f"/api/v1/generations/{first}", json={"favorite": True})
    assert updated.json()["data"]["favorite"] is True
    filtered = await client.get(
        url="/api/v1/generations", params={"q": "cat", "task_id": "bozza", "favorite": True}
    )
    assert [item["id"] for item in filtered.json()["data"]] == [first]
    assert (await client.get(url=f"/api/v1/generations/{first}/image")).headers[
        "content-type"
    ] == "image/png"
    assert (await client.get(url=f"/api/v1/generations/{first}/thumbnail")).headers[
        "content-type"
    ] == "image/webp"
    assert (await client.delete(url=f"/api/v1/generations/{first}")).status_code == 204
    assert (await client.get(url=f"/api/v1/generations/{first}")).status_code == 404
    assert (await client.get(url="/api/v1/generations")).json()["meta"]["total"] == 1
    with application.state.database.sessions() as session:
        assert session.get(entity=GenerationRecord, ident=first).deleted_at is not None


@pytest.mark.parametrize("column,endpoint", [("image_path", "image"), ("thumb_path", "thumbnail")])
async def test_generation_file_rejects_traversal(
    job_app: JobApp, column: str, endpoint: str
) -> None:
    application, client = job_app
    generation_id = await generate(client=client)
    assert (
        await client.get(url=f"/api/v1/generations/{generation_id}/{endpoint}")
    ).status_code == 200
    outside = application.state.settings.data_dir.parent / "outside.png"
    outside.write_bytes(data=b"secret")
    with application.state.database.sessions.begin() as session:
        setattr(session.get(entity=GenerationRecord, ident=generation_id), column, "../outside.png")
    assert (
        await client.get(url=f"/api/v1/generations/{generation_id}/{endpoint}")
    ).status_code == 404


async def test_rerun_seed_and_idempotency(job_app: JobApp) -> None:
    _, client = job_app
    generation_id = await generate(client=client)
    url = f"/api/v1/generations/{generation_id}/rerun"
    responses = await asyncio.gather(
        *[
            client.post(url=url, json={"new_seed": True}, headers={"Idempotency-Key": "rerun"})
            for _ in range(2)
        ]
    )
    assert all(response.status_code == 202 for response in responses)
    assert responses[0].json() == responses[1].json()
    result = await wait_terminal(client=client, job_id=responses[0].json()["data"]["job_id"])
    detail = await client.get(url=f"/api/v1/generations/{result['generation_ids'][0]}")
    assert detail.json()["data"]["seed"] != 42
    conflict = await client.post(
        url=url, json={"new_seed": False}, headers={"Idempotency-Key": "rerun"}
    )
    assert conflict.status_code == 409
    same = await client.post(url=url, json={"new_seed": False})
    result = await wait_terminal(client=client, job_id=same.json()["data"]["job_id"])
    detail = await client.get(url=f"/api/v1/generations/{result['generation_ids'][0]}")
    assert detail.json()["data"]["seed"] == 42


async def test_rerun_different_generations_conflict_with_same_key(job_app: JobApp) -> None:
    _, client = job_app
    first = await generate(client=client, seed=42)
    second = await generate(client=client, seed=43)
    first_response = await client.post(
        url=f"/api/v1/generations/{first}/rerun",
        json={"new_seed": True},
        headers={"Idempotency-Key": "origin"},
    )
    second_response = await client.post(
        url=f"/api/v1/generations/{second}/rerun",
        json={"new_seed": True},
        headers={"Idempotency-Key": "origin"},
    )
    assert first_response.status_code == 202
    assert second_response.status_code == 409


async def test_gallery_filters_by_any_of_several_tasks(job_app: JobApp) -> None:
    _, client = job_app
    sketch_like = await generate(client=client, prompt="cat")
    response = await client.post(
        url="/api/v1/jobs",
        json={"task_id": "qualita", "prompt": "dog", "params": {"seed": 1, "style_ids": []}},
    )
    result = await wait_terminal(client=client, job_id=response.json()["data"]["job_id"])
    quality = result["generation_ids"][0]

    both = await client.get(
        url="/api/v1/generations", params=[("task_ids", "bozza"), ("task_ids", "qualita")]
    )
    only_quality = await client.get(
        url="/api/v1/generations", params=[("task_ids", "qualita"), ("task_ids", "foto")]
    )

    assert {item["id"] for item in both.json()["data"]} == {sketch_like, quality}
    assert [item["id"] for item in only_quality.json()["data"]] == [quality]
