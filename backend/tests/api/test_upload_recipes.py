import json
from io import BytesIO
from typing import Any
from unittest.mock import patch

import pytest
from PIL import Image, PngImagePlugin
from test_generations import generate
from test_jobs import JobApp
from test_jobs import job_app as job_app
from test_uploads import image_bytes


def valid_recipe() -> dict[str, Any]:
    return {
        "task_id": "bozza",
        "prompt": "un gatto",
        "negative_prompt": "sfocato",
        "params": {"aspect_ratio": "1:1", "seed": 42, "style_ids": [], "steps": 20, "cfg": 7.0},
    }


def recipe_png(chunk: str) -> bytes:
    info = PngImagePlugin.PngInfo()
    info.add_text(key="studio_immagini", value=chunk)
    output = BytesIO()
    Image.new(mode="RGBA", size=(8, 6), color=(255, 0, 0, 0)).save(
        fp=output, format="PNG", pnginfo=info
    )
    return output.getvalue()


async def test_upload_imports_recipe_from_real_generation(job_app: JobApp) -> None:
    _, client = job_app
    generation_id = await generate(client=client, prompt="un gatto", seed=42)
    detail = (await client.get(url=f"/api/v1/generations/{generation_id}")).json()["data"]
    png = await client.get(url=f"/api/v1/generations/{generation_id}/image")
    response = await client.post(
        url="/api/v1/uploads", data={"kind": "image"}, files={"file": ("export.png", png.content)}
    )
    assert response.status_code == 201
    expected = {key: detail[key] for key in ("task_id", "prompt", "negative_prompt")}
    expected["params"] = {
        key: detail["params"][key] for key in ("aspect_ratio", "seed", "style_ids", "steps", "cfg")
    }
    assert response.json()["data"]["recipe"] == expected


@pytest.mark.parametrize("format", ["JPEG", "PNG"])
async def test_upload_without_recipe_returns_null(job_app: JobApp, format: str) -> None:
    response = await job_app[1].post(
        url="/api/v1/uploads", data={"kind": "image"}, files={"file": image_bytes(format=format)}
    )
    assert response.status_code == 201
    assert response.json()["data"]["width"] == 40
    assert response.json()["data"]["recipe"] is None


@pytest.mark.parametrize("chunk", ["{bad", "[]", "null", "0", "[" * 2000 + "]" * 2000])
async def test_upload_invalid_recipe_does_not_reject_image(job_app: JobApp, chunk: str) -> None:
    response = await job_app[1].post(
        url="/api/v1/uploads", data={"kind": "image"}, files={"file": recipe_png(chunk=chunk)}
    )
    assert response.status_code == 201
    assert response.json()["data"]["height"] == 6
    assert response.json()["data"]["recipe"] is None


async def test_upload_oversized_chunk_is_not_parsed(job_app: JobApp) -> None:
    chunk = json.dumps(obj={**valid_recipe(), "ignored": "x" * (64 * 1024)})
    original = json.loads

    def reject_large_json(s: str | bytes | bytearray, **kwargs: Any) -> Any:
        assert len(s) <= 64 * 1024
        return original(s, **kwargs)

    with patch(target="app.services.upload_service.json.loads", side_effect=reject_large_json):
        response = await job_app[1].post(
            url="/api/v1/uploads", data={"kind": "image"}, files={"file": recipe_png(chunk=chunk)}
        )
    assert response.status_code == 201
    assert response.json()["data"]["height"] == 6
    assert response.json()["data"]["recipe"] is None


async def test_upload_drops_extra_keys_but_keeps_valid_recipe(job_app: JobApp) -> None:
    recipe = valid_recipe()
    hostile = {**recipe, "path": "../../secret", "params": {**recipe["params"], "command": "rm"}}
    response = await job_app[1].post(
        url="/api/v1/uploads",
        data={"kind": "image"},
        files={"file": recipe_png(chunk=json.dumps(obj=hostile))},
    )
    assert response.status_code == 201
    assert response.json()["data"]["recipe"] == recipe


@pytest.mark.parametrize(
    "field,value",
    [
        ("style_ids", ["style"] * 20),
        ("style_ids", [1]),
        ("seed", "42"),
        ("seed", -1),
        ("seed", 2**32),
        ("seed", True),
        ("aspect_ratio", {"nested": "bad"}),
        ("steps", "20"),
        ("cfg", "7"),
        ("cfg", float("nan")),
    ],
)
async def test_upload_invalid_required_param_discards_entire_recipe(
    job_app: JobApp, field: str, value: Any
) -> None:
    recipe = valid_recipe()
    recipe["params"][field] = value
    response = await job_app[1].post(
        url="/api/v1/uploads",
        data={"kind": "image"},
        files={"file": recipe_png(chunk=json.dumps(obj=recipe))},
    )
    assert response.status_code == 201
    assert response.json()["data"]["height"] == 6
    assert response.json()["data"]["recipe"] is None


@pytest.mark.parametrize(
    "field,value",
    [
        ("prompt", "x" * 2001),
        ("negative_prompt", "x" * 2001),
        ("task_id", 12),
        ("prompt", {"nested": "bad"}),
        ("params", None),
    ],
)
async def test_upload_invalid_required_field_discards_entire_recipe(
    job_app: JobApp, field: str, value: Any
) -> None:
    recipe = {**valid_recipe(), field: value}
    response = await job_app[1].post(
        url="/api/v1/uploads",
        data={"kind": "image"},
        files={"file": recipe_png(chunk=json.dumps(obj=recipe))},
    )
    assert response.status_code == 201
    assert response.json()["data"]["width"] == 8
    assert response.json()["data"]["recipe"] is None


async def test_mask_upload_never_parses_recipe(job_app: JobApp) -> None:
    content = recipe_png(chunk=json.dumps(obj=valid_recipe()))
    with patch(target="app.services.upload_service.parse_recipe", side_effect=AssertionError):
        response = await job_app[1].post(
            url="/api/v1/uploads", data={"kind": "mask"}, files={"file": content}
        )
    assert response.status_code == 201
    assert response.json()["data"]["width"] == 8
    assert response.json()["data"]["recipe"] is None
