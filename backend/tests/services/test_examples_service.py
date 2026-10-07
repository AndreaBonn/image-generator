import json
import logging
from pathlib import Path

import pytest

from app.services.examples_service import available_examples


def write_manifest(path: Path, entries: list[object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(entries), encoding="utf-8")


def test_malformed_entries_log_one_warning_with_the_discarded_count(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    manifest_path = tmp_path / "manifest.json"
    write_manifest(manifest_path, [1, "x", None, {"id": "ok", "file": "ok.webp"}])

    with caplog.at_level(logging.WARNING):
        available_examples(manifest_path=manifest_path, tasks=[], examples_dir=tmp_path)

    warnings = [record for record in caplog.records if record.levelno == logging.WARNING]
    assert len(warnings) == 1
    assert "3" in warnings[0].message


def test_well_formed_manifest_logs_no_warning(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    manifest_path = tmp_path / "manifest.json"
    write_manifest(manifest_path, [{"id": "ok", "file": "ok.webp"}])

    with caplog.at_level(logging.WARNING):
        available_examples(manifest_path=manifest_path, tasks=[], examples_dir=tmp_path)

    assert not [record for record in caplog.records if record.levelno == logging.WARNING]
