from datetime import timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from test_generations import generate
from test_jobs import JobApp
from test_jobs import job_app as job_app

from app.models.records import GenerationRecord, utc_now


def generation_paths(job_app: JobApp, generation_id: str) -> tuple[Path, Path]:
    application, _ = job_app
    with application.state.database.sessions() as session:
        record = session.get(entity=GenerationRecord, ident=generation_id)
        root = application.state.settings.data_dir
        return root / record.image_path, root / record.thumb_path


async def test_trash_list_paginates_by_deletion_time(job_app: JobApp) -> None:
    application, client = job_app
    first = await generate(client=client, prompt="cat")
    second = await generate(client=client, prompt="dog")
    active = await generate(client=client)
    for generation_id in (first, second):
        await client.delete(url=f"/api/v1/generations/{generation_id}")
    with application.state.database.sessions.begin() as session:
        session.get(entity=GenerationRecord, ident=first).deleted_at = utc_now()
        session.get(entity=GenerationRecord, ident=second).deleted_at = utc_now() - timedelta(
            days=1
        )
    for page, expected in ((1, first), (2, second)):
        response = await client.get(
            url="/api/v1/generations", params={"trashed": True, "page": page, "per_page": 1}
        )
        assert response.status_code == 200
        assert [item["id"] for item in response.json()["data"]] == [expected]
        assert response.json()["meta"] == {
            "page": page,
            "per_page": 1,
            "total": 2,
            "total_pages": 2,
        }
    for params in ({}, {"trashed": False}):
        response = await client.get(url="/api/v1/generations", params=params)
        assert [item["id"] for item in response.json()["data"]] == [active]


async def test_trash_list_keeps_gallery_filters(job_app: JobApp) -> None:
    _, client = job_app
    favorite = await generate(client=client, prompt="100% cat")
    other = await generate(client=client, prompt="dog")
    await client.patch(url=f"/api/v1/generations/{favorite}", json={"favorite": True})
    for generation_id in (favorite, other):
        await client.delete(url=f"/api/v1/generations/{generation_id}")
    response = await client.get(
        url="/api/v1/generations",
        params={"trashed": True, "favorite": True, "q": "%", "task_id": "bozza"},
    )
    assert response.json()["meta"]["total"] == 1
    assert [item["id"] for item in response.json()["data"]] == [favorite]


async def test_restore_returns_detail_and_moves_record_back_to_gallery(job_app: JobApp) -> None:
    application, client = job_app
    generation_id = await generate(client=client)
    original = (await client.get(url=f"/api/v1/generations/{generation_id}")).json()["data"]
    await client.delete(url=f"/api/v1/generations/{generation_id}")
    response = await client.post(url=f"/api/v1/generations/{generation_id}/restore")
    assert response.status_code == 200
    restored = response.json()["data"]
    assert restored == {**original, "updated_at": restored["updated_at"]}
    with application.state.database.sessions() as session:
        assert session.get(entity=GenerationRecord, ident=generation_id).deleted_at is None
    for trashed, expected in ((False, [generation_id]), (True, [])):
        page = await client.get(url="/api/v1/generations", params={"trashed": trashed})
        assert [item["id"] for item in page.json()["data"]] == expected


@pytest.mark.parametrize("existing", [False, True])
async def test_restore_requires_a_trashed_record(job_app: JobApp, existing: bool) -> None:
    _, client = job_app
    generation_id = await generate(client=client) if existing else str(uuid4())
    response = await client.post(url=f"/api/v1/generations/{generation_id}/restore")
    assert response.status_code == 404
    assert response.json()["error"]["message"] == "Generazione non trovata."


@pytest.mark.parametrize("missing", [False, True])
async def test_trash_summary_counts_all_rows_and_existing_bytes(
    job_app: JobApp, missing: bool
) -> None:
    _, client = job_app
    ids = [await generate(client=client) for _ in range(3)]
    paths = [path for generation_id in ids[:2] for path in generation_paths(job_app, generation_id)]
    for generation_id in ids[:2]:
        await client.delete(url=f"/api/v1/generations/{generation_id}")
    if missing:
        paths[0].unlink()
    expected = sum(path.stat().st_size for path in paths if path.exists())
    response = await client.get(url="/api/v1/generations/trash/summary")
    assert response.status_code == 200
    assert response.json() == {"data": {"count": 2, "bytes": expected}}
    assert all(path.exists() for path in generation_paths(job_app, ids[2]))


@pytest.mark.parametrize("missing", [False, True])
async def test_empty_trash_unlinks_files_and_detaches_children(
    job_app: JobApp, missing: bool
) -> None:
    application, client = job_app
    parent, trashed_child, active_child = [await generate(client=client) for _ in range(3)]
    with application.state.database.sessions.begin() as session:
        for child in (trashed_child, active_child):
            session.get(entity=GenerationRecord, ident=child).parent_id = parent
    paths = [path for item in (parent, trashed_child) for path in generation_paths(job_app, item)]
    for generation_id in (parent, trashed_child):
        await client.delete(url=f"/api/v1/generations/{generation_id}")
    assert all(path.exists() for path in paths)
    if missing:
        paths[0].unlink()
    expected = sum(path.stat().st_size for path in paths if path.exists())
    response = await client.post(url="/api/v1/generations/trash/empty")
    assert response.status_code == 200
    assert response.json() == {"data": {"purged": 2, "freed_bytes": expected}}
    assert all(not path.exists() for path in paths)
    with application.state.database.sessions() as session:
        assert session.get(entity=GenerationRecord, ident=parent) is None
        assert session.get(entity=GenerationRecord, ident=trashed_child) is None
        assert session.get(entity=GenerationRecord, ident=active_child).parent_id is None
    assert all(path.exists() for path in generation_paths(job_app, active_child))
    assert (await client.post(url="/api/v1/generations/trash/empty")).json() == {
        "data": {"purged": 0, "freed_bytes": 0}
    }
    assert (await client.get(url="/api/v1/generations/trash/summary")).json() == {
        "data": {"count": 0, "bytes": 0}
    }


@pytest.mark.parametrize("action", ["restore", "empty"])
async def test_trash_mutations_keep_cross_site_guard(job_app: JobApp, action: str) -> None:
    _, client = job_app
    generation_id = await generate(client=client)
    await client.delete(url=f"/api/v1/generations/{generation_id}")
    suffix = f"{generation_id}/restore" if action == "restore" else "trash/empty"
    response = await client.post(
        url=f"/api/v1/generations/{suffix}", headers={"Sec-Fetch-Site": "cross-site"}
    )
    assert response.status_code == 403
    page = await client.get(url="/api/v1/generations", params={"trashed": True})
    assert [item["id"] for item in page.json()["data"]] == [generation_id]
