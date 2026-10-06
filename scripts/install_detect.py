"""Filesystem checks for install.py's "what is already here" state detection.

Kept free of install.py/install_models.py imports: callers inject the digest
and status functions they already have, so this module stays testable with
plain tmp_path fixtures and no network, registry or subprocess access.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from pathlib import Path


def engine_installed(engine_dir: Path) -> bool:
    """True once ComfyUI has been cloned into `engine_dir`."""
    return (engine_dir / "ComfyUI" / "main.py").is_file()


def backend_deps_installed(backend_dir: Path) -> bool:
    """True once `uv sync` has created the backend's virtualenv."""
    return (backend_dir / ".venv").is_dir()


def frontend_built(frontend_dir: Path) -> bool:
    """True once `npm run build` has produced the frontend's dist/ output."""
    return (frontend_dir / "dist" / "index.html").is_file()


def missing_style_filenames(
    *,
    source: object,
    destination_dir: Path,
    digest_fn: Callable[[Path], str],
) -> tuple[str, ...]:
    """Pinned style filenames that are absent or differ from `source` on disk."""
    missing: list[str] = []
    for style in source.files:
        destination = destination_dir / style.filename
        if not destination.is_file() or digest_fn(destination) != style.sha256:
            missing.append(style.filename)
    return tuple(missing)


def missing_enabled_model_ids(
    *,
    entries: Sequence[object],
    status_fn: Callable[[object], str],
) -> tuple[str, ...]:
    """Ids of enabled, downloadable models not yet present on disk."""
    return tuple(
        entry.id
        for entry in entries
        if entry.enabled and entry.source == "huggingface" and status_fn(entry) == "missing"
    )
