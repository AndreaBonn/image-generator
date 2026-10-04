from io import BytesIO
from typing import Any

import pytest
from PIL import Image
from test_image_bindings import RecordingEngine
from test_image_jobs import upload
from test_jobs import JobApp, wait_terminal
from test_jobs import job_app as job_app

from app.api.v1.jobs import get_engine


@pytest.mark.parametrize(
    "task_id,expected",
    [
        ("modifica_libera", (528, 272)),
        ("rimuovi_sfondo", (537, 281)),
        ("ingrandisci_rifinito", (1072, 560)),
    ],
)
async def test_new_image_jobs_bind_and_save(
    job_app: JobApp, task_id: str, expected: tuple[int, int]
) -> None:
    application, client = job_app
    engine = RecordingEngine()
    application.dependency_overrides[get_engine] = lambda: engine
    response = await client.post(
        url="/api/v1/jobs",
        json={
            "task_id": task_id,
            "prompt": "metti il cielo al tramonto" if task_id == "modifica_libera" else "",
            "input_upload_id": await upload(client=client, size=(537, 281)),
            "params": {"seed": 42},
        },
    )
    assert response.status_code == 202, response.text
    result = await wait_terminal(client=client, job_id=response.json()["data"]["job_id"])
    assert result["status"] == "completed", result
    generation_id = result["generation_ids"][0]
    content = (await client.get(url=f"/api/v1/generations/{generation_id}/image")).content
    with Image.open(fp=BytesIO(content)) as image:
        assert image.size == expected
        assert image.mode == ("RGBA" if task_id == "rimuovi_sfondo" else "RGB")
        if task_id == "rimuovi_sfondo":
            assert image.getchannel(channel="A").getextrema() == (0, 255)
    nodes = {node["_meta"]["title"]: node["inputs"] for node in engine.requests[0].graph.values()}
    assert_bound_dimensions(task_id=task_id, nodes=nodes, expected=expected)


def assert_bound_dimensions(task_id: str, nodes: dict[str, Any], expected: tuple[int, int]) -> None:
    assert isinstance(nodes["@input_image"]["image"], str)
    if task_id == "rimuovi_sfondo":
        assert nodes["@bg_model"]["bg_removal_name"] == "birefnet.safetensors"
        return
    assert (nodes["@resize"]["width"], nodes["@resize"]["height"]) == expected
    if task_id == "modifica_libera":
        for title in ("@scheduler", "@latent"):
            assert (nodes[title]["width"], nodes[title]["height"]) == expected
        assert nodes["@noise"]["noise_seed"] == 42
        assert nodes["@scheduler"]["steps"] == 4
    else:
        assert (nodes["@merge"]["final_width"], nodes["@merge"]["final_height"]) == expected
        assert nodes["@sampler"]["denoise"] == 0.3
        assert nodes["@sampler"]["steps"] == 12


@pytest.mark.parametrize("task_id", ["modifica_libera", "rimuovi_sfondo", "ingrandisci_rifinito"])
async def test_new_task_requires_source_and_accepts_valid_request(
    job_app: JobApp, task_id: str
) -> None:
    _, client = job_app
    body = {"task_id": task_id, "prompt": "cat"}
    invalid = await client.post(url="/api/v1/jobs", json=body)
    assert invalid.status_code == 422
    assert invalid.json()["error"]["details"][0]["field"] == "input_upload_id"
    valid = await client.post(
        url="/api/v1/jobs", json={**body, "input_upload_id": await upload(client=client)}
    )
    assert valid.status_code == 202
    result = await wait_terminal(client=client, job_id=valid.json()["data"]["job_id"])
    assert result["status"] == "completed"


@pytest.mark.parametrize(
    "task_id,batch,status",
    [
        ("modifica_libera", 2, 202),
        ("rimuovi_sfondo", 1, 202),
        ("rimuovi_sfondo", 2, 422),
        ("ingrandisci_rifinito", 1, 202),
        ("ingrandisci_rifinito", 2, 422),
    ],
)
async def test_new_task_batch_policy(
    job_app: JobApp, task_id: str, batch: int, status: int
) -> None:
    _, client = job_app
    response = await client.post(
        url="/api/v1/jobs",
        json={
            "task_id": task_id,
            "prompt": "cat",
            "params": {"batch": batch},
            "input_upload_id": await upload(client=client),
        },
    )
    assert response.status_code == status, response.text
    if status == 202:
        result = await wait_terminal(client=client, job_id=response.json()["data"]["job_id"])
        assert result["status"] == "completed"
        assert len(result["generation_ids"]) == batch
    else:
        assert response.json()["error"]["details"][0]["field"] == "params.batch"
