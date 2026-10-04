from io import BytesIO
from uuid import UUID

import pytest
from PIL import Image
from test_jobs import JobApp
from test_jobs import job_app as job_app

from app.models.records import UploadRecord


def image_bytes(size: tuple[int, int] = (40, 24), format: str = "PNG") -> bytes:
    output = BytesIO()
    Image.new(mode="RGB", size=size, color="white").save(fp=output, format=format)
    return output.getvalue()


@pytest.mark.parametrize("format", ["PNG", "JPEG", "WEBP"])
async def test_upload_converts_content_and_uses_uuid(job_app: JobApp, format: str) -> None:
    application, client = job_app
    response = await client.post(
        url="/api/v1/uploads",
        data={"kind": "image"},
        files={"file": ("../../evil.exe", image_bytes(format=format), "text/plain")},
    )
    assert response.status_code == 201, response.text
    data = response.json()["data"]
    UUID(data["upload_id"])
    assert (data["width"], data["height"]) == (40, 24)
    with application.state.database.sessions() as session:
        record = session.get(entity=UploadRecord, ident=data["upload_id"])
        assert record.path == f"uploads/{record.id}.png"
    with Image.open(fp=application.state.settings.data_dir / record.path) as image:
        assert image.format == "PNG"


@pytest.mark.parametrize(
    "content",
    [b"not an image", b"x" * (20 * 1024 * 1024 + 1), image_bytes(size=(4097, 1))],
    ids=["fake", "oversized", "wide"],
)
async def test_upload_rejects_invalid_content(job_app: JobApp, content: bytes) -> None:
    response = await job_app[1].post(
        url="/api/v1/uploads",
        data={"kind": "mask"},
        files={"file": ("image.png", content, "image/png")},
    )
    assert response.status_code == 422
    assert response.json()["error"]["details"][0]["field"] == "file"


@pytest.mark.parametrize("kind", ["invalid", ""])
async def test_upload_requires_valid_kind(job_app: JobApp, kind: str) -> None:
    response = await job_app[1].post(
        url="/api/v1/uploads",
        data={"kind": kind},
        files={"file": image_bytes()},
    )
    assert response.status_code == 422
