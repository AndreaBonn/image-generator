import logging
from typing import Any, cast

import httpx

from app.engine.workflow_builder import Graph
from app.errors import EngineRejectedError, EngineUnavailableError

logger = logging.getLogger(__name__)


def summarize_rejection(payload: dict[str, Any]) -> str:
    summaries = []
    for node_id, node in payload.get("node_errors", {}).items():
        errors = "; ".join(
            ": ".join(str(error[key]) for key in ("message", "details") if error.get(key))
            for error in node.get("errors", [])
        )
        summaries.append(f"Nodo {node_id} ({node.get('class_type', 'sconosciuto')}): {errors}")
    return ". ".join(summaries) or EngineRejectedError.default_message


def _json_or_empty(response: httpx.Response) -> dict[str, Any]:
    try:
        payload = response.json()
    except ValueError:
        return {}
    return payload if isinstance(payload, dict) else {}


class ComfyClient:
    def __init__(self, http: httpx.AsyncClient) -> None:
        self.http = http

    async def _send(self, request: httpx.Request) -> httpx.Response:
        try:
            response = await self.http.send(request=request)
        except httpx.RequestError as error:
            raise EngineUnavailableError() from error
        if not response.is_success:
            logger.error("Engine HTTP error: %s %s", response.status_code, response.text)
            if response.is_client_error and request.url.path == "/prompt":
                raise EngineRejectedError(
                    message=summarize_rejection(payload=_json_or_empty(response))
                )
            raise EngineUnavailableError()
        return response

    async def queue_prompt(self, graph: Graph, client_id: str) -> str:
        request = self.http.build_request(
            method="POST", url="/prompt", json={"prompt": graph, "client_id": client_id}
        )
        response = await self._send(request=request)
        return str(response.json()["prompt_id"])

    async def history(self, prompt_id: str) -> dict[str, Any]:
        request = self.http.build_request(method="GET", url=f"/history/{prompt_id}")
        return cast(dict[str, Any], (await self._send(request=request)).json())

    async def view(self, filename: str, subfolder: str, type: str) -> bytes:
        request = self.http.build_request(
            method="GET",
            url="/view",
            params={"filename": filename, "subfolder": subfolder, "type": type},
        )
        return (await self._send(request=request)).content

    async def upload_image(self, image: bytes, name: str) -> str:
        request = self.http.build_request(
            method="POST",
            url="/upload/image",
            files={"image": (name, image, "image/png")},
            data={"overwrite": "true"},
        )
        return str((await self._send(request=request)).json()["name"])

    async def interrupt(self) -> None:
        await self._send(request=self.http.build_request(method="POST", url="/interrupt"))

    async def cancel_prompt(self, prompt_id: str) -> None:
        await self.delete_from_queue(prompt_id=prompt_id)
        # ComfyUI server.py:1176 supports a targeted interrupt after the queue deletion.
        await self._send(
            request=self.http.build_request(
                method="POST", url="/interrupt", json={"prompt_id": prompt_id}
            )
        )

    async def delete_from_queue(self, prompt_id: str) -> None:
        await self._send(
            request=self.http.build_request(
                method="POST", url="/queue", json={"delete": [prompt_id]}
            )
        )

    async def free(self) -> None:
        await self._send(
            request=self.http.build_request(
                method="POST", url="/free", json={"unload_models": True, "free_memory": True}
            )
        )

    async def system_stats(self) -> dict[str, Any]:
        request = self.http.build_request(method="GET", url="/system_stats")
        return cast(dict[str, Any], (await self._send(request=request)).json())
