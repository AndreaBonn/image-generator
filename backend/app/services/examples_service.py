"""Service layer for the Crea first-use examples (AS-P11 / O10).

Decides which manifest entries are currently servable (task still available today,
image actually on disk) and whether the gallery is empty enough to count as a
first use. The manifest itself is written offline by `app.cli.assets examples`.
"""

import json
import logging
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from app.models.task import TaskView
from app.repositories.generation_repository import GenerationRepository
from app.services.asset_generation import plan_examples

logger = logging.getLogger(__name__)

MANIFEST_FILENAME = "manifest.json"


def read_manifest(path: Path) -> list[dict[str, Any]]:
    """Read the examples manifest, tolerating a missing or corrupt file.

    A missing manifest means the CLI has never run; both cases degrade to an
    empty gallery instead of a 500, with a WARNING only when the file exists
    but cannot be parsed.
    """
    try:
        raw = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return []
    try:
        entries = json.loads(raw)
    except ValueError:
        logger.warning("Manifest esempi illeggibile: %s", path)
        return []
    return entries if isinstance(entries, list) else []


def available_examples(
    manifest_path: Path, tasks: Sequence[TaskView], examples_dir: Path
) -> list[dict[str, Any]]:
    """Manifest entries whose task is available today and whose image exists.

    A task that lost its model since the manifest was written, or an entry whose
    image was never generated, is skipped rather than surfaced as a broken example.
    """
    available_ids = {plan.id for plan in plan_examples(tasks=tasks)}
    entries = read_manifest(path=manifest_path)
    well_formed = [entry for entry in entries if _is_well_formed(entry=entry)]
    if discarded := len(entries) - len(well_formed):
        logger.warning(
            "Examples manifest %s: %d malformed entries discarded", manifest_path, discarded
        )
    return [
        entry
        for entry in well_formed
        if entry["id"] in available_ids and (examples_dir / entry["file"]).is_file()
    ]


def _is_well_formed(entry: object) -> bool:
    """A hand-edited or truncated manifest degrades to fewer examples, never to a 500."""
    return (
        isinstance(entry, dict)
        and isinstance(entry.get("id"), str)
        and isinstance(entry.get("file"), str)
    )


def is_first_use(generations: GenerationRepository) -> bool:
    """AS-P11: first use means no generation ever existed, trash included."""
    return not generations.has_any()
