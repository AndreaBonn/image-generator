from io import BytesIO
from typing import Any, Literal
from uuid import uuid4

import httpx
import pytest
from PIL import Image
from test_jobs import JobApp, wait_terminal
from test_jobs import job_app as job_app
from test_uploads import image_bytes


async def upload(
    client: httpx.AsyncClient,
    kind: Literal["image", "mask"] = "image",
    size: tuple[int, int] = (64, 32),
) -> str:
    response = await client.post(
        url="/api/v1/uploads",
        data={"kind": kind},
        files={"file": ("image.png", image_bytes(size=size))},
    )
    assert response.status_code == 201
    upload_id = response.json()["data"]["upload_id"]
    assert isinstance(upload_id, str)
    return upload_id


@pytest.mark.parametrize(
    "task_id,expected",
    [
        ("inpaint", (64, 32)),
        ("outpaint", (80, 40)),
        ("variazione_sottile", (1408, 704)),
        ("variazione_forte", (1408, 704)),
        ("upscale", (128, 64)),
    ],
)
async def test_image_jobs_complete_with_real_dimensions(
    job_app: JobApp, task_id: str, expected: tuple[int, int]
) -> None:
    application, client = job_app
    body: dict[str, Any] = {
        "task_id": task_id,
        "input_upload_id": await upload(client=client),
        "params": {"seed": 13},
    }
    if task_id == "inpaint":
        body.update(
            prompt="cat", mask_upload_id=await upload(client=client, kind="mask", size=(10, 20))
        )
    if task_id == "outpaint":
        body["outpaint_directions"] = ["right", "bottom"]
    if task_id == "upscale":
        body["upscale_factor"] = 2
    response = await client.post(url="/api/v1/jobs", json=body)
    assert response.status_code == 202, response.text
    result = await wait_terminal(client=client, job_id=response.json()["data"]["job_id"])
    assert result["status"] == "completed", result
    generation_id = result["generation_ids"][0]
    detail = (await client.get(url=f"/api/v1/generations/{generation_id}")).json()["data"]
    assert (detail["width"], detail["height"]) == expected
    assert detail["parent_id"] is None
    content = (await client.get(url=f"/api/v1/generations/{generation_id}/image")).content
    assert Image.open(fp=BytesIO(content)).size == expected
    assert len(application.state.engine.uploaded_images) == (2 if task_id == "inpaint" else 1)


@pytest.mark.parametrize(
    "body,field",
    [
        ({"task_id": "inpaint", "prompt": "cat"}, "input_upload_id"),
        ({"task_id": "inpaint"}, "prompt"),
        ({"task_id": "outpaint"}, "input_upload_id"),
        ({"task_id": "upscale", "upscale_factor": 3}, "upscale_factor"),
        (
            {"task_id": "upscale", "input_upload_id": str(uuid4()), "upscale_factor": 2},
            "input_upload_id",
        ),
    ],
)
async def test_image_job_rejects_missing_input(
    job_app: JobApp, body: dict[str, Any], field: str
) -> None:
    response = await job_app[1].post(url="/api/v1/jobs", json=body)
    assert response.status_code == 422
    assert response.json()["error"]["details"][0]["field"] == field


async def test_image_job_requires_mask_directions_and_single_batch(job_app: JobApp) -> None:
    _, client = job_app
    image_id = await upload(client=client)
    cases: list[tuple[dict[str, Any], str]] = [
        ({"task_id": "inpaint", "prompt": "cat"}, "mask_upload_id"),
        ({"task_id": "outpaint"}, "outpaint_directions"),
        ({"task_id": "variazione_sottile", "params": {"batch": 2}}, "params.batch"),
        ({"task_id": "upscale"}, "upscale_factor"),
    ]
    for body, field in cases:
        response = await client.post(url="/api/v1/jobs", json={**body, "input_upload_id": image_id})
        assert response.status_code == 422, response.text
        assert response.json()["error"]["details"][0]["field"] == field


async def test_source_parent_and_rerun_keep_original_input(job_app: JobApp) -> None:
    _, client = job_app
    image_id = await upload(client=client)
    response = await client.post(
        url="/api/v1/jobs",
        json={"task_id": "upscale", "input_upload_id": image_id, "upscale_factor": 2},
    )
    original = await wait_terminal(client=client, job_id=response.json()["data"]["job_id"])
    parent = original["generation_ids"][0]
    body = {
        "task_id": "inpaint",
        "prompt": "cat",
        "source_generation_id": parent,
        "mask_upload_id": await upload(client=client, kind="mask"),
        "params": {"seed": 42},
    }
    response = await client.post(url="/api/v1/jobs", json=body)
    child = await wait_terminal(client=client, job_id=response.json()["data"]["job_id"])
    generation_id = child["generation_ids"][0]
    detail = (await client.get(url=f"/api/v1/generations/{generation_id}")).json()["data"]
    assert detail["parent_id"] == parent
    response = await client.post(
        url=f"/api/v1/generations/{generation_id}/rerun", json={"new_seed": True}
    )
    rerun = await wait_terminal(client=client, job_id=response.json()["data"]["job_id"])
    assert rerun["request"]["source_generation_id"] == parent
    assert rerun["request"]["mask_upload_id"] == body["mask_upload_id"]
    assert rerun["status"] == "completed"
