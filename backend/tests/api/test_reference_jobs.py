from typing import Any
from uuid import uuid4

import pytest
from test_jobs import JobApp
from test_jobs import job_app as job_app


@pytest.mark.parametrize(
    "body",
    [
        {"task_id": "crea_da_riferimenti", "prompt": "cat"},
        {"task_id": "crea_da_riferimenti", "prompt": "cat", "references": []},
        {
            "task_id": "crea_da_riferimenti",
            "prompt": "cat",
            "references": [{"upload_id": str(uuid4())} for _ in range(4)],
        },
    ],
)
async def test_reference_job_rejects_invalid_reference_count(
    job_app: JobApp, body: dict[str, Any]
) -> None:
    _, client = job_app
    response = await client.post(url="/api/v1/jobs", json=body)
    assert response.status_code == 422, response.text
    assert response.json()["error"]["details"][0]["field"] == "references"


@pytest.mark.parametrize(
    "reference",
    [
        {},
        {"upload_id": str(uuid4()), "generation_id": str(uuid4())},
    ],
)
async def test_reference_job_rejects_malformed_reference_entry(
    job_app: JobApp, reference: dict[str, Any]
) -> None:
    _, client = job_app
    response = await client.post(
        url="/api/v1/jobs",
        json={"task_id": "crea_da_riferimenti", "prompt": "cat", "references": [reference]},
    )
    assert response.status_code == 422, response.text
