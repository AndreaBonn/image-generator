"""Subprocess runners for install.py's steps (engine, deps, build, models).

Isolated from install.py so tests can monkeypatch `run_command` (or any
`run_*_step`) and assert exactly which commands would run, without ever
executing a real subprocess.
"""

from __future__ import annotations

import subprocess
from collections.abc import Callable, Sequence
from pathlib import Path


def run_command(args: Sequence[str], *, cwd: Path | None = None) -> None:
    """Run an external command as an argument list; never through a shell."""
    subprocess.run(list(args), cwd=cwd, check=True)


def run_engine_step(repo_root: Path) -> None:
    """Install (or repair) the ComfyUI engine via the cross-platform Python port.

    `uv run --script` on every OS: unlike the `.sh` wrapper, this has no bash
    dependency, so install.py stays usable on Windows/macOS too.
    """
    run_command(["uv", "run", "--script", str(repo_root / "engine" / "install_engine.py")])


def run_backend_deps_step(repo_root: Path) -> None:
    """Sync the backend's uv-managed virtualenv."""
    run_command(["uv", "sync"], cwd=repo_root / "backend")


def run_frontend_build_step(repo_root: Path) -> None:
    """Install frontend dependencies from the lockfile, then build dist/."""
    frontend_dir = repo_root / "frontend"
    run_command(["npm", "ci"], cwd=frontend_dir)
    run_command(["npm", "run", "build"], cwd=frontend_dir)


def run_models_step(
    *,
    model_ids: Sequence[str],
    entries: Sequence[object],
    paths: object,
    min_free_gb: float,
    download_fn: Callable[..., None],
) -> None:
    """Download every id in `model_ids`, looked up by id in `entries`."""
    by_id = {entry.id: entry for entry in entries}
    for model_id in model_ids:
        download_fn(entry=by_id[model_id], paths=paths, min_free_gb=min_free_gb)
