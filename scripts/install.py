#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["pyyaml>=6.0"]
# ///
"""Install the app from scratch: engine, backend/frontend deps, styles, models.

Detects what is already in place and runs only the steps still needed, in
order: engine, backend_deps, frontend_build, styles, models. `--dry-run`
previews the plan, `--profile` picks which models to download, `--only`
restricts execution to a single step name.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import os
import shutil
import sys
import urllib.request
from dataclasses import dataclass
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
STYLES_CONFIG_PATH = REPO_ROOT / "config" / "styles.yaml"
DEFAULT_DATA_DIR = REPO_ROOT / "data"
RAW_BASE_URL = "https://raw.githubusercontent.com"


def _load_sibling(module_name: str) -> object:
    """Load scripts/<module_name>.py by path, so this script runs standalone."""
    path = Path(__file__).resolve().parent / f"{module_name}.py"
    spec = importlib.util.spec_from_file_location(module_name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


install_models = _load_sibling("install_models")
install_plan = _load_sibling("install_plan")
install_detect = _load_sibling("install_detect")
install_runner = _load_sibling("install_runner")

# Re-exported so existing callers (tests included) keep using `install.<name>`
# regardless of where the logic physically lives.
PROFILES = install_plan.PROFILES
Step = install_plan.Step
InstallState = install_plan.InstallState
DiskBudget = install_plan.DiskBudget
disk_budget = install_plan.disk_budget
format_gb_it = install_plan.format_gb_it
base_profile_model_ids = install_plan.base_profile_model_ids
build_models_step = install_plan.build_models_step
plan_steps = install_plan.plan_steps


@dataclass(frozen=True)
class StyleFile:
    filename: str
    sha256: str


@dataclass(frozen=True)
class StylesSource:
    repo: str
    commit: str
    files: tuple[StyleFile, ...]


def load_styles_source(path: Path = STYLES_CONFIG_PATH) -> StylesSource:
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    files = tuple(StyleFile(filename=f["filename"], sha256=f["sha256"]) for f in raw["files"])
    return StylesSource(repo=raw["repo"], commit=raw["commit"], files=files)


def style_raw_url(source: StylesSource, filename: str) -> str:
    return f"{RAW_BASE_URL}/{source.repo}/{source.commit}/sdxl_styles/{filename}"


def fetch_bytes(url: str) -> bytes:
    """Download `url`. Isolated so tests can replace it with a network-free fake."""
    if not url.startswith("https://"):
        raise ValueError(f"refusing non-https url: {url}")
    with urllib.request.urlopen(url, timeout=30) as response:
        return response.read()


class StyleMismatchError(RuntimeError):
    """A style file has different content than the one pinned in config/styles.yaml."""


def sync_style_file(style: StyleFile, source: StylesSource, destination_dir: Path) -> str:
    """Install one style file, verifying sha256; never overwrite a mismatch.

    Returns "skipped" when an identical file is already on disk, "installed"
    otherwise.
    """
    destination = destination_dir / style.filename
    if destination.is_file():
        digest = install_models.sha256_of(destination)
        if digest == style.sha256:
            return "skipped"
        raise StyleMismatchError(
            f"{style.filename}: contenuto locale diverso dalla fonte pinnata "
            f"(sha256 {digest}, atteso {style.sha256}); file esistente non toccato."
        )
    content = fetch_bytes(style_raw_url(source=source, filename=style.filename))
    digest = hashlib.sha256(content).hexdigest()
    if digest != style.sha256:
        raise StyleMismatchError(
            f"{style.filename}: sha256 scaricato {digest}, atteso {style.sha256}; file non salvato."
        )
    destination_dir.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(content)
    return "installed"


def sync_styles(source: StylesSource, destination_dir: Path) -> dict[str, str]:
    """Install every pinned style file, returning its outcome keyed by filename."""
    return {
        style.filename: sync_style_file(style=style, source=source, destination_dir=destination_dir)
        for style in source.files
    }


def resolve_data_dir() -> Path:
    return Path(os.environ.get("DATA_DIR", DEFAULT_DATA_DIR))


def run_styles_step() -> int:
    source = load_styles_source()
    destination_dir = resolve_data_dir() / "styles"
    results = sync_styles(source=source, destination_dir=destination_dir)
    installed = sum(1 for status in results.values() if status == "installed")
    skipped = len(results) - installed
    print(f"Stili: {installed} scaricati, {skipped} già presenti, in {destination_dir}.")
    return 0


@dataclass(frozen=True)
class InstallContext:
    """Everything a step needs to detect its state or run: no globals, no env lookups."""

    repo_root: Path
    data_dir: Path
    paths: object  # install_models.Paths
    entries: tuple[object, ...]
    min_free_gb: float


def build_context() -> InstallContext:
    repo_root = REPO_ROOT
    models_dir = Path(os.environ.get("MODELS_DIR", repo_root / "engine" / "models"))
    return InstallContext(
        repo_root=repo_root,
        data_dir=resolve_data_dir(),
        paths=install_models.Paths(models_dir=models_dir),
        entries=tuple(install_models.load_registry()),
        min_free_gb=float(os.environ.get("MIN_FREE_DISK_GB", install_models.DEFAULT_MIN_FREE_GB)),
    )


def free_bytes_at(path: Path) -> int:
    """Free space at `path`, isolated so tests can fake it without a real disk.

    On a fresh clone `engine/models` does not exist until the engine step runs, so the
    nearest existing parent (same filesystem in practice) is measured instead.
    """
    while not path.exists() and path != path.parent:
        path = path.parent
    return shutil.disk_usage(path).free


def detect_state(ctx: InstallContext) -> InstallState:
    """Read the filesystem/registry to know which steps are still needed."""
    styles_source = load_styles_source()
    return InstallState(
        engine_installed=install_detect.engine_installed(ctx.repo_root / "engine"),
        backend_deps_installed=install_detect.backend_deps_installed(ctx.repo_root / "backend"),
        frontend_built=install_detect.frontend_built(ctx.repo_root / "frontend"),
        missing_style_filenames=install_detect.missing_style_filenames(
            source=styles_source,
            destination_dir=ctx.data_dir / "styles",
            digest_fn=install_models.sha256_of,
        ),
        missing_model_ids=install_detect.missing_enabled_model_ids(
            entries=ctx.entries,
            status_fn=lambda entry: install_models.model_status(entry, ctx.paths),
        ),
    )


def models_budget(steps: list[Step], ctx: InstallContext) -> DiskBudget | None:
    """Disk budget for the models step in `steps`, or None if there isn't one."""
    models_step = next((step for step in steps if step.name == "models"), None)
    if models_step is None:
        return None
    relevant = [entry for entry in ctx.entries if entry.id in models_step.model_ids]
    return disk_budget(
        missing=relevant, free_bytes=free_bytes_at(ctx.paths.models_dir), margin_gb=ctx.min_free_gb
    )


def execute_step(step: Step, ctx: InstallContext) -> None:
    """Run the one real action behind `step`."""
    if step.name == "engine":
        install_runner.run_engine_step(ctx.repo_root)
    elif step.name == "backend_deps":
        install_runner.run_backend_deps_step(ctx.repo_root)
    elif step.name == "frontend_build":
        install_runner.run_frontend_build_step(ctx.repo_root)
    elif step.name == "styles":
        run_styles_step()
    elif step.name == "models":
        install_runner.run_models_step(
            model_ids=step.model_ids,
            entries=ctx.entries,
            paths=ctx.paths,
            min_free_gb=ctx.min_free_gb,
            download_fn=install_models.download,
        )
    else:
        raise ValueError(f"unknown step '{step.name}'")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--profile",
        choices=PROFILES,
        default="completo",
        help="quali modelli installare (default: completo)",
    )
    parser.add_argument(
        "--only",
        choices=("engine", "backend_deps", "frontend_build", "styles", "models"),
        default=None,
        help="esegue solo questo passo, e solo se ancora necessario",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="mostra i passi previsti senza eseguirli",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    ctx = build_context()
    steps = plan_steps(profile=args.profile, state=detect_state(ctx))
    if args.only is not None:
        steps = [step for step in steps if step.name == args.only]
    if not steps:
        print("Niente da scaricare.")
        return 0

    budget = models_budget(steps, ctx)
    if budget is not None and not budget.ok:
        print(budget.describe())
        return 1

    for step in steps:
        print(step.description)
        if not args.dry_run:
            execute_step(step, ctx)
    return 0


if __name__ == "__main__":
    sys.exit(main())
