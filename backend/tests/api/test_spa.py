from pathlib import Path

import httpx
import pytest

from app.main import create_app


async def test_missing_dist_explains_build(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.api.spa.REPO_ROOT", tmp_path)
    application = create_app()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=application), base_url="http://test"
    ) as client:
        response = await client.get(url="/")
        assert response.status_code == 200
        assert "cd frontend && npm run build" in response.text
        assert (await client.get(url="/api/unknown")).status_code == 404


async def test_missing_dist_with_nested_path_returns_not_found(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("app.api.spa.REPO_ROOT", tmp_path)
    application = create_app()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=application), base_url="http://test"
    ) as client:
        response = await client.get(url="/galleria")
        assert response.status_code == 404
        assert response.json()["error"]["message"] == "Pagina non trovata."


async def test_spa_assets_fallback_and_api_exclusion(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("app.api.spa.REPO_ROOT", tmp_path)
    dist = tmp_path / "frontend/dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text(data="<html>Studio</html>")
    (dist / "assets/app.js").write_text(data="const app = 1;")
    outside = tmp_path / "secret"
    outside.write_text(data="private")
    (dist / "secret").symlink_to(target=outside)
    application = create_app()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=application), base_url="http://test"
    ) as client:
        for path in ["/", "/galleria", "/galleria/image"]:
            response = await client.get(url=path)
            assert response.status_code == 200 and response.text == "<html>Studio</html>"
        assert (await client.get(url="/assets/app.js")).text == "const app = 1;"
        assert (await client.get(url="/api/v1/unknown")).status_code == 404
        assert (await client.get(url="/api")).status_code == 404
        assert (await client.get(url="/secret")).status_code == 404
        assert (await client.post(url="/galleria")).status_code == 404


async def test_missing_asset_and_unknown_api_return_enveloped_404(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("app.api.spa.REPO_ROOT", tmp_path)
    dist = tmp_path / "frontend/dist"
    dist.mkdir(parents=True)
    (dist / "index.html").write_text(data="<html>Studio</html>")
    application = create_app()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=application), base_url="http://test"
    ) as client:
        asset = await client.get(url="/assets/missing.js")
        assert asset.status_code == 404
        assert asset.json()["error"]["code"] == "NOT_FOUND"

        api = await client.get(url="/api/v1/unknown")
        assert api.status_code == 404
        assert api.json()["error"]["code"] == "NOT_FOUND"

        traversal = await client.get(url="/..%2f..%2fsecret")
        assert traversal.status_code == 404
        assert "Generazione" not in traversal.json()["error"]["message"]


async def test_index_is_never_cached_but_hashed_assets_can_be(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("app.api.spa.REPO_ROOT", tmp_path)
    dist = tmp_path / "frontend/dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text(data="<html>Studio</html>")
    (dist / "assets/index-abc123.js").write_text(data="const app = 1;")
    application = create_app()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=application), base_url="http://test"
    ) as client:
        for path in ["/", "/galleria"]:
            response = await client.get(url=path)
            assert response.headers["cache-control"] == "no-cache"
        asset = await client.get(url="/assets/index-abc123.js")
        assert "no-cache" not in asset.headers.get("cache-control", "")
