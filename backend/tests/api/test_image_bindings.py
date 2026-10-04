from collections.abc import AsyncGenerator
from io import BytesIO
from typing import Any

import pytest
from PIL import Image
from test_image_jobs import upload
from test_jobs import JobApp, wait_terminal
from test_jobs import job_app as job_app

from app.api.v1.jobs import get_engine
from app.engine.fake_engine import FakeEngine
from app.engine.types import EngineEvent, EngineRequest


class RecordingEngine(FakeEngine):
    def __init__(self) -> None:
        super().__init__(step_delay_s=0)
        self.requests: list[EngineRequest] = []

    async def run(self, request: EngineRequest) -> AsyncGenerator[EngineEvent, None]:
        self.requests.append(request)
        async for event in super().run(request=request):
            yield event


@pytest.mark.parametrize(
    "task_id", ["inpaint", "outpaint", "variazione_sottile", "variazione_forte", "upscale"]
)
async def test_image_workflows_receive_bound_inputs(job_app: JobApp, task_id: str) -> None:
    application, client = job_app
    engine = RecordingEngine()
    application.dependency_overrides[get_engine] = lambda: engine
    body: dict[str, Any] = {
        "task_id": task_id,
        "prompt": "cat",
        "negative_prompt": "blur",
        "params": {"seed": 321},
        "input_upload_id": await upload(client=client, size=(513, 257)),
    }
    if task_id == "inpaint":
        body["mask_upload_id"] = await upload(client=client, kind="mask", size=(50, 40))
    if task_id == "outpaint":
        body["outpaint_directions"] = ["left", "top"]
    if task_id == "upscale":
        body["upscale_factor"] = 4
    response = await client.post(url="/api/v1/jobs", json=body)
    result = await wait_terminal(client=client, job_id=response.json()["data"]["job_id"])
    assert result["status"] == "completed", result
    assert len(engine.requests) == 1 and engine.requests[0].batch == 1
    nodes = {node["_meta"]["title"]: node["inputs"] for node in engine.requests[0].graph.values()}
    assert nodes["@input_image"]["image"] in engine.uploaded_images
    assert_task_bindings(task_id=task_id, nodes=nodes, engine=engine)


def assert_task_bindings(task_id: str, nodes: dict[str, Any], engine: RecordingEngine) -> None:
    if task_id == "upscale":
        assert nodes["@scale"]["scale_by"] == 1.0
        return
    assert nodes["@prompt_pos"]["text"] == "cat" and nodes["@prompt_neg"]["text"] == "blur"
    assert nodes["@sampler"]["seed"] == 321
    assert nodes["@sampler"]["steps"] == 30 and nodes["@sampler"]["cfg"] == 4.0
    if task_id.startswith("variazione"):
        assert nodes["@resize"]["width"] == 1408 and nodes["@resize"]["height"] == 704
        assert nodes["@sampler"]["denoise"] == (0.5 if task_id == "variazione_sottile" else 0.85)
    if task_id == "outpaint":
        assert [nodes["@pad"][side] for side in ("left", "top", "right", "bottom")] == [
            152,
            80,
            0,
            0,
        ]
    if task_id == "inpaint":
        image = engine.uploaded_images[nodes["@input_image"]["image"]]
        mask = engine.uploaded_images[nodes["@input_mask"]["image"]]
        assert Image.open(fp=BytesIO(image)).size == Image.open(fp=BytesIO(mask)).size == (512, 256)
        assert set(Image.open(fp=BytesIO(mask)).convert(mode="L").tobytes()) <= {0, 255}


async def test_image_job_rejects_wrong_kind_and_oversized_upscale(job_app: JobApp) -> None:
    _, client = job_app
    mask_id = await upload(client=client, kind="mask")
    invalid = await client.post(
        url="/api/v1/jobs",
        json={"task_id": "upscale", "input_upload_id": mask_id, "upscale_factor": 2},
    )
    assert invalid.status_code == 422
    image_id = await upload(client=client, size=(4096, 1))
    large = await client.post(
        url="/api/v1/jobs",
        json={"task_id": "upscale", "input_upload_id": image_id, "upscale_factor": 4},
    )
    assert large.status_code == 422
    assert large.json()["error"]["details"][0]["field"] == "upscale_factor"
    allowed = await client.post(
        url="/api/v1/jobs",
        json={"task_id": "upscale", "input_upload_id": image_id, "upscale_factor": 2},
    )
    assert allowed.status_code == 202
