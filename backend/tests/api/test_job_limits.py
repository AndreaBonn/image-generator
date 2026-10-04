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


async def test_jobs_rate_limit_admits_new_request_after_window_expires(job_app: JobApp) -> None:
    _, client = job_app
    # One monotonic() call per request: 1st and 2nd share t=0 (still inside the window),
    # 3rd is at t=61 i.e. past RATE_WINDOW_S=60, so the stale timestamp must be evicted.
    clock = iter([0.0, 0.0, 61.0])
    with (
        patch("app.api.v1.job_limits.MAX_REQUESTS_PER_WINDOW", 1),
        patch("app.api.v1.job_limits.monotonic", side_effect=lambda: next(clock)),
    ):
        first = await client.post("/api/v1/jobs", json={"task_id": "bozza", "prompt": "cat"})
        second = await client.post("/api/v1/jobs", json={"task_id": "bozza", "prompt": "cat"})
        third = await client.post("/api/v1/jobs", json={"task_id": "bozza", "prompt": "cat"})
    assert first.status_code == 202
    assert second.status_code == 429
    assert third.status_code == 202
