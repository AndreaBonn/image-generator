from pathlib import Path

import pytest
from test_jobs import JobApp
from test_jobs import job_app as job_app

CLEAR_URL = "/api/v1/maintenance/clear-engine-output"


@pytest.fixture
def output_with_file(job_app: JobApp, tmp_path: Path) -> Path:
    application, _ = job_app
    output = tmp_path / "output"
    studio = output / "studio"
    studio.mkdir(parents=True)
    (studio / "result.png").write_bytes(b"png")
    application.state.settings = application.state.settings.model_copy(
        update={"comfy_output_dir": output}
    )
    return studio / "result.png"


@pytest.mark.parametrize(
    "headers",
    [
        {"Sec-Fetch-Site": "cross-site"},
        {"Sec-Fetch-Site": "same-site"},
        {"Origin": "https://evil.example"},
        {"Origin": "null"},
        # DNS rebinding: the browser sees the request as same-origin, but the
        # Origin carries the attacker's hostname.
        {"Sec-Fetch-Site": "same-origin", "Origin": "http://rebind.example:8000"},
    ],
)
async def test_cross_site_mutation_is_rejected_and_has_no_effect(
    job_app: JobApp, output_with_file: Path, headers: dict[str, str]
) -> None:
    _, client = job_app

    response = await client.post(url=CLEAR_URL, headers=headers)

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "CROSS_SITE_REQUEST"
    assert output_with_file.exists()


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Sec-Fetch-Site": "same-origin", "Origin": "http://127.0.0.1:8000"},
        {"Sec-Fetch-Site": "none"},
        # Vite dev server proxies /api: the Origin is the dev server's.
        {"Sec-Fetch-Site": "same-origin", "Origin": "http://localhost:5173"},
    ],
)
async def test_same_origin_or_non_browser_mutation_is_allowed(
    job_app: JobApp, output_with_file: Path, headers: dict[str, str]
) -> None:
    _, client = job_app

    response = await client.post(url=CLEAR_URL, headers=headers)

    assert response.status_code == 200, response.text
    assert not output_with_file.exists()


async def test_cross_site_read_is_not_blocked(job_app: JobApp) -> None:
    _, client = job_app

    response = await client.get(
        url="/api/v1/health",
        headers={"Sec-Fetch-Site": "cross-site", "Origin": "https://x.example"},
    )

    assert response.status_code == 200


@pytest.mark.parametrize(
    "method,url",
    [
        ("POST", "/api/v1/jobs"),
        ("POST", "/api/v1/uploads"),
        ("POST", "/api/v1/generations/00000000-0000-0000-0000-000000000000/rerun"),
        ("DELETE", "/api/v1/generations/00000000-0000-0000-0000-000000000000"),
    ],
)
async def test_every_mutating_route_is_guarded(job_app: JobApp, method: str, url: str) -> None:
    _, client = job_app

    response = await client.request(
        method=method, url=url, headers={"Sec-Fetch-Site": "cross-site"}
    )

    assert response.status_code == 403
