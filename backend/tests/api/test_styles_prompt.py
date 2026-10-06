from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.prompt import router as prompt_router
from app.api.v1.styles import router as styles_router
from app.errors import AppError, handle_app_error
from app.models.style import Style
from app.repositories.asset_repository import AssetRepository, preview_id
from app.services.style_service import StyleService


def make_client(data_dir: Path) -> TestClient:
    app = FastAPI()
    app.add_exception_handler(AppError, handle_app_error)
    app.state.style_service = StyleService(styles=(Style(name="Photo", source_file="a.json"),))
    app.state.asset_repository = AssetRepository(data_dir=data_dir)
    app.include_router(router=styles_router, prefix="/api/v1")
    app.include_router(router=prompt_router, prefix="/api/v1")
    return TestClient(app=app)


def test_list_styles_query_returns_public_fields(tmp_path: Path) -> None:
    client = make_client(data_dir=tmp_path)
    assert client.get(url="/api/v1/styles?q=PHOTO").json() == {
        "data": [{"id": "Photo", "name": "Photo", "source_file": "a.json", "preview_url": None}],
    }
    assert client.get(url="/api/v1/styles?q=missing").json() == {"data": []}


def test_list_styles_includes_preview_url_once_the_preview_exists(tmp_path: Path) -> None:
    AssetRepository(data_dir=tmp_path).save(style_name="Photo", content=b"webp-bytes")
    client = make_client(data_dir=tmp_path)

    data = client.get(url="/api/v1/styles").json()["data"]

    expected_id = preview_id(style_name="Photo")
    assert data[0]["preview_url"] == f"/api/v1/styles/previews/{expected_id}"


def test_get_style_preview_returns_the_saved_webp(tmp_path: Path) -> None:
    AssetRepository(data_dir=tmp_path).save(style_name="Photo", content=b"webp-bytes")
    client = make_client(data_dir=tmp_path)
    asset_id = preview_id(style_name="Photo")

    response = client.get(url=f"/api/v1/styles/previews/{asset_id}")

    assert response.status_code == 200
    assert response.content == b"webp-bytes"
    assert response.headers["content-type"] == "image/webp"


def test_get_style_preview_404_when_missing_or_not_a_valid_id(tmp_path: Path) -> None:
    client = make_client(data_dir=tmp_path)

    ghost_id = preview_id(style_name="Ghost")
    assert client.get(url=f"/api/v1/styles/previews/{ghost_id}").status_code == 404
    assert client.get(url="/api/v1/styles/previews/..%2F..%2Fetc%2Fpasswd").status_code == 404
    assert client.get(url="/api/v1/styles/previews/not-hex").status_code == 404


def test_check_language_italian_and_english_returns_boolean(tmp_path: Path) -> None:
    client = make_client(data_dir=tmp_path)
    assert client.post(
        url="/api/v1/prompt/language-check", json={"text": "una casa con"}
    ).json() == {"data": {"looks_italian": True}}
    assert client.post(
        url="/api/v1/prompt/language-check", json={"text": "a house with"}
    ).json() == {"data": {"looks_italian": False}}
    assert client.post(url="/api/v1/prompt/language-check", json={"text": 10}).status_code == 422
