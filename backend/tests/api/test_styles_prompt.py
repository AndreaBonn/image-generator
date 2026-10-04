from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.prompt import router as prompt_router
from app.api.v1.styles import router as styles_router
from app.models.style import Style
from app.services.style_service import StyleService


def make_client() -> TestClient:
    app = FastAPI()
    app.state.style_service = StyleService(styles=(Style(name="Photo", source_file="a.json"),))
    app.include_router(router=styles_router, prefix="/api/v1")
    app.include_router(router=prompt_router, prefix="/api/v1")
    return TestClient(app=app)


def test_list_styles_query_returns_public_fields() -> None:
    client = make_client()
    assert client.get(url="/api/v1/styles?q=PHOTO").json() == {
        "data": [{"id": "Photo", "name": "Photo", "source_file": "a.json"}],
    }
    assert client.get(url="/api/v1/styles?q=missing").json() == {"data": []}


def test_check_language_italian_and_english_returns_boolean() -> None:
    client = make_client()
    assert client.post(
        url="/api/v1/prompt/language-check", json={"text": "una casa con"}
    ).json() == {
        "looks_italian": True,
    }
    assert client.post(
        url="/api/v1/prompt/language-check", json={"text": "a house with"}
    ).json() == {
        "looks_italian": False,
    }
    assert client.post(url="/api/v1/prompt/language-check", json={"text": 10}).status_code == 422
