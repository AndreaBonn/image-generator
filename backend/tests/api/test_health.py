import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.mark.parametrize(
    "status,expected", [(200, "ok"), (500, "unreachable"), (302, "unreachable")]
)
@respx.mock
def test_health_engine_status(status: int, expected: str) -> None:
    route = respx.get("http://127.0.0.1:8188/system_stats").respond(status)
    with TestClient(create_app()) as client:
        response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"data": {"backend": "ok", "engine": expected}}
    assert route.calls[0].request.extensions["timeout"]["read"] == 2.0
    assert len(respx.calls) == 1


@pytest.mark.parametrize("error", [httpx.ConnectError, httpx.ReadTimeout])
@respx.mock
def test_health_unreachable_engine(error: type[httpx.RequestError]) -> None:
    respx.get("http://127.0.0.1:8188/system_stats").mock(side_effect=error("offline"))
    with TestClient(create_app()) as client:
        response = client.get("/api/v1/health")
    assert response.json() == {"data": {"backend": "ok", "engine": "unreachable"}}
