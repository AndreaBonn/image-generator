import json

import httpx
import pytest
import respx

from app.engine.comfy_client import ComfyClient
from app.errors import EngineRejectedError, EngineUnavailableError

URL = "http://127.0.0.1:8188"


@respx.mock
async def test_client_http_contracts() -> None:
    prompt = respx.post(URL + "/prompt").respond(json={"prompt_id": "p"})
    respx.get(URL + "/history/p").respond(json={"p": {"outputs": {}}})
    view = respx.get(URL + "/view").respond(content=b"image")
    upload = respx.post(URL + "/upload/image").respond(json={"name": "assigned.png"})
    interrupt = respx.post(URL + "/interrupt").respond()
    delete = respx.post(URL + "/queue").respond()
    free = respx.post(URL + "/free").respond()
    respx.get(URL + "/system_stats").respond(json={"devices": []})
    async with httpx.AsyncClient(base_url=URL) as http:
        client = ComfyClient(http=http)
        assert await client.queue_prompt(graph={"1": {}}, client_id="client") == "p"
        assert await client.history(prompt_id="p") == {"p": {"outputs": {}}}
        assert await client.view(filename="a.png", subfolder="studio", type="output") == b"image"
        assert await client.upload_image(image=b"png", name="input.png") == "assigned.png"
        await client.interrupt()
        await client.delete_from_queue(prompt_id="p")
        await client.free()
        assert await client.system_stats() == {"devices": []}
    assert json.loads(prompt.calls[0].request.content) == {
        "prompt": {"1": {}},
        "client_id": "client",
    }
    assert view.calls[0].request.url.params["subfolder"] == "studio"
    assert b'name="image"; filename="input.png"' in upload.calls[0].request.content
    assert b"true" in upload.calls[0].request.content
    assert interrupt.called
    assert json.loads(delete.calls[0].request.content) == {"delete": ["p"]}
    assert json.loads(free.calls[0].request.content) == {"unload_models": True, "free_memory": True}


@respx.mock
async def test_client_summarizes_node_errors() -> None:
    respx.post(URL + "/prompt").respond(
        status_code=400,
        json={
            "node_errors": {
                "6": {
                    "class_type": "KSampler",
                    "errors": [{"message": "Invalid input", "details": "steps"}],
                }
            }
        },
    )
    async with httpx.AsyncClient(base_url=URL) as http:
        with pytest.raises(EngineRejectedError, match="6.*KSampler.*Invalid input.*steps"):
            await ComfyClient(http=http).queue_prompt(graph={}, client_id="c")


@respx.mock
async def test_client_treats_any_4xx_on_prompt_as_rejection() -> None:
    respx.post(URL + "/prompt").respond(
        status_code=422,
        json={"node_errors": {"3": {"class_type": "VAELoader", "errors": [{"message": "Bad"}]}}},
    )
    async with httpx.AsyncClient(base_url=URL) as http:
        with pytest.raises(EngineRejectedError, match="3.*VAELoader.*Bad"):
            await ComfyClient(http=http).queue_prompt(graph={}, client_id="c")


@respx.mock
async def test_client_rejection_without_json_body_still_reports_rejection() -> None:
    respx.post(URL + "/prompt").respond(status_code=400, text="bad request")
    async with httpx.AsyncClient(base_url=URL) as http:
        with pytest.raises(EngineRejectedError):
            await ComfyClient(http=http).queue_prompt(graph={}, client_id="c")


@respx.mock
async def test_client_server_error_on_prompt_is_engine_unavailable() -> None:
    respx.post(URL + "/prompt").respond(status_code=500, text="boom")
    async with httpx.AsyncClient(base_url=URL) as http:
        with pytest.raises(EngineUnavailableError):
            await ComfyClient(http=http).queue_prompt(graph={}, client_id="c")


@pytest.mark.parametrize("failure", [httpx.ConnectError, httpx.ReadTimeout])
@respx.mock
async def test_client_translates_transport_errors(failure: type[httpx.RequestError]) -> None:
    respx.route().mock(side_effect=failure("offline"))
    async with httpx.AsyncClient(base_url=URL) as http:
        with pytest.raises(EngineUnavailableError):
            await ComfyClient(http=http).system_stats()
