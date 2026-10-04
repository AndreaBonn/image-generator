import logging
from pathlib import Path
from typing import Any
from unittest.mock import patch

import pytest
from sqlalchemy import event
from sqlalchemy.engine import Connection
from test_generation_trash import generation_paths
from test_generations import generate
from test_jobs import JobApp
from test_jobs import job_app as job_app

from app.models.records import GenerationRecord


@pytest.mark.parametrize("unsafe", ["traversal", "symlink"])
async def test_purge_skips_unsafe_paths_and_preserves_external_file(
    job_app: JobApp, unsafe: str, caplog: pytest.LogCaptureFixture
) -> None:
    application, client = job_app
    generation_id = await generate(client=client)
    image, thumb = generation_paths(job_app, generation_id)
    outside = application.state.settings.data_dir.parent / f"outside-{generation_id}.png"
    outside.write_bytes(data=b"protected")
    if unsafe == "traversal":
        with application.state.database.sessions.begin() as session:
            record = session.get(entity=GenerationRecord, ident=generation_id)
            record.image_path = f"../{outside.name}"
    else:
        image.unlink()
        image.symlink_to(target=outside)
    await client.delete(url=f"/api/v1/generations/{generation_id}")
    expected = thumb.stat().st_size
    assert (await client.get(url="/api/v1/generations/trash/summary")).json() == {
        "data": {"count": 1, "bytes": expected}
    }
    with caplog.at_level(level=logging.WARNING):
        response = await client.post(url="/api/v1/generations/trash/empty")
    assert response.json() == {"data": {"purged": 1, "freed_bytes": expected}}
    assert outside.read_bytes() == b"protected"
    assert not thumb.exists()
    assert f"Skipping unsafe generation path during purge: id={generation_id}" in caplog.text


async def test_purge_commits_database_before_unlinking(job_app: JobApp) -> None:
    application, client = job_app
    generation_id = await generate(client=client)
    paths = generation_paths(job_app, generation_id)
    await client.delete(url=f"/api/v1/generations/{generation_id}")
    original_unlink = Path.unlink
    observed: list[Path] = []

    def check_committed(path: Path, missing_ok: bool = False) -> None:
        with application.state.database.sessions() as session:
            assert session.get(entity=GenerationRecord, ident=generation_id) is None
        observed.append(path)
        original_unlink(path, missing_ok=missing_ok)

    with patch.object(target=Path, attribute="unlink", new=check_committed):
        response = await client.post(url="/api/v1/generations/trash/empty")
    assert response.status_code == 200
    assert set(observed) == set(paths)
    assert all(not path.exists() for path in paths)


async def test_purge_database_failure_rolls_back_children_and_keeps_files(job_app: JobApp) -> None:
    application, client = job_app
    parent, child = [await generate(client=client) for _ in range(2)]
    with application.state.database.sessions.begin() as session:
        session.get(entity=GenerationRecord, ident=child).parent_id = parent
    await client.delete(url=f"/api/v1/generations/{parent}")
    paths = generation_paths(job_app, parent)

    def fail_delete(connection: Connection, clause: Any, *args: Any) -> None:
        if str(clause).startswith("DELETE FROM generations"):
            raise RuntimeError("Database unavailable")

    engine = application.state.database.engine
    event.listen(target=engine, identifier="before_execute", fn=fail_delete)
    try:
        with pytest.raises(RuntimeError, match="Database unavailable"):
            await client.post(url="/api/v1/generations/trash/empty")
    finally:
        event.remove(target=engine, identifier="before_execute", fn=fail_delete)
    with application.state.database.sessions() as session:
        assert session.get(entity=GenerationRecord, ident=parent).deleted_at is not None
        assert session.get(entity=GenerationRecord, ident=child).parent_id == parent
    assert all(path.exists() for path in paths)
