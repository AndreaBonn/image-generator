import asyncio
import json
import subprocess
from collections.abc import AsyncIterator
from dataclasses import replace
from io import BytesIO
from pathlib import Path
from typing import Any
from uuid import uuid4

import httpx
import pytest
from PIL import Image

from app.config import Settings
from app.engine.comfy_client import ComfyClient
from app.engine.types import EngineRequest
from app.engine.workflow_builder import Graph
from app.models.image_input import ImageInput
from app.models.job import JobParams, JobRequest
from app.repositories.image_repository import ImageRepository
from app.services.image_preparation import prepare_images
from app.services.job_execution import build_requests
from app.services.job_inputs import image_dimensions
from app.services.job_resolution import resolve_job
from app.services.style_service import StyleService
from app.services.task_catalog import load_catalog

pytestmark = pytest.mark.engine
ENGINE_URL = "http://127.0.0.1:8188"
COMPLETION_TIMEOUT_S = 600
POLL_INTERVAL_S = 1
SOURCE_SIZE = (1152, 896)


@pytest.fixture
async def live_http() -> AsyncIterator[httpx.AsyncClient]:
    processes = subprocess.run(
        args=["nvidia-smi", "--query-compute-apps=process_name", "--format=csv,noheader"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert processes.returncode == 0, (
        f"Cannot verify GPU availability: {processes.stdout}{processes.stderr}"
    )
    assert "ollama" not in processes.stdout.lower(), "Ollama is holding the GPU"
    async with httpx.AsyncClient(base_url=ENGINE_URL, timeout=30) as http:
        queue = (await http.get(url="/queue")).raise_for_status().json()
        assert queue["queue_running"] == [] and queue["queue_pending"] == [], queue
        yield http


async def prepare_request(task_id: str, path: Path, client: ComfyClient) -> EngineRequest:
    settings = Settings()
    job = resolve_job(
        request=JobRequest(
            task_id=task_id,
            prompt="metti il cielo al tramonto" if task_id == "modifica_libera" else "",
            input_upload_id=uuid4(),
            params=JobParams(seed=42),
        ),
        catalog=load_catalog(settings=settings),
        styles=StyleService(styles=()),
        is_fake=False,
    )
    source = ImageInput(path=path, size=SOURCE_SIZE)
    size, values = image_dimensions(job=job, source=source)
    job = replace(
        job,
        image_input=source,
        params=job.params.model_copy(update={"width": size[0], "height": size[1]}),
    )
    content, _ = prepare_images(job=job)
    values["input_image"] = await client.upload_image(image=content, name=f"contract-{uuid4()}.png")
    job = replace(job, binding_values=values)
    assert job.task.workflow is not None
    template = json.loads(
        s=(settings.workflows_dir / job.task.workflow).read_text(encoding="utf-8")
    )
    return build_requests(job=job, template=template)[0]


def assert_node_contract(graph: Graph, info: dict[str, Any]) -> None:
    for node in graph.values():
        assert node["class_type"] in info
        schema = info[node["class_type"]]["input"]
        names = schema.get("required", {}).keys() | schema.get("optional", {}).keys()
        assert node["inputs"].keys() <= names, node


async def completed_history(client: ComfyClient, prompt_id: str) -> dict[str, Any]:
    async with asyncio.timeout(delay=COMPLETION_TIMEOUT_S):
        while True:
            history = await client.history(prompt_id=prompt_id)
            if prompt_id in history:
                record: dict[str, Any] = history[prompt_id]
                assert record["status"]["status_str"] == "success", record["status"]
                assert record["status"]["completed"] is True
                return record
            await asyncio.sleep(delay=POLL_INTERVAL_S)


@pytest.mark.parametrize("task_id", ["modifica_libera", "rimuovi_sfondo", "ingrandisci_rifinito"])
async def test_live_image_task_completes(
    live_http: httpx.AsyncClient, tmp_path: Path, task_id: str
) -> None:
    source_path = tmp_path / "source.png"
    Image.new(mode="RGB", size=SOURCE_SIZE, color="orange").save(fp=source_path)
    client = ComfyClient(http=live_http)
    request = await prepare_request(task_id=task_id, path=source_path, client=client)
    info = (await live_http.get(url="/object_info")).raise_for_status().json()
    assert_node_contract(graph=request.graph, info=info)
    prompt_id = await client.queue_prompt(graph=request.graph, client_id=str(uuid4()))
    record = await completed_history(client=client, prompt_id=prompt_id)
    references = [image for node in record["outputs"].values() for image in node.get("images", [])]
    assert len(references) == 1
    reference = references[0]
    content = await client.view(
        filename=reference["filename"], subfolder=reference["subfolder"], type=reference["type"]
    )
    expected = (2304, 1792) if task_id == "ingrandisci_rifinito" else SOURCE_SIZE
    with Image.open(fp=BytesIO(content)) as output:
        assert output.size == expected
        assert output.mode == ("RGBA" if task_id == "rimuovi_sfondo" else "RGB")
    saved = ImageRepository(data_dir=tmp_path).save(image=content, metadata={"task_id": task_id})
    with Image.open(fp=tmp_path / saved.thumb_path) as thumbnail:
        if task_id == "rimuovi_sfondo":
            assert thumbnail.mode == "RGBA"
