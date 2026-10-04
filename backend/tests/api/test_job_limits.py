from unittest.mock import patch

from test_jobs import JobApp
from test_jobs import job_app as job_app


async def test_jobs_rate_limit_rejects_excess_requests(job_app: JobApp) -> None:
    _, client = job_app
    with patch("app.api.v1.job_limits.MAX_REQUESTS_PER_WINDOW", 1):
        first = await client.post("/api/v1/jobs", json={"task_id": "bozza", "prompt": "cat"})
        second = await client.post("/api/v1/jobs", json={"task_id": "bozza", "prompt": "cat"})
    assert first.status_code == 202
    assert second.status_code == 429
    assert second.json()["error"]["code"] == "RATE_LIMITED"
