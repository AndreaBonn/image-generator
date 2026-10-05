#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["pyyaml>=6.0", "huggingface_hub>=0.25"]
# ///
"""Install, list and remove the models declared in config/models.yaml."""

from __future__ import annotations

import argparse
import hashlib
import os
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
REGISTRY_PATH = REPO_ROOT / "config" / "models.yaml"
MIGRATE_COMMAND = "uv run --script scripts/migrate_from_fooocus.py --apply"
DEFAULT_MODELS_DIR = REPO_ROOT / "engine" / "models"
DEFAULT_MIN_FREE_GB = 5.0
GB = 1024**3
HASH_CHUNK_BYTES = 8 * 1024 * 1024
DOWNLOAD_STAGING = ".downloads"


@dataclass(frozen=True)
class ModelEntry:
    id: str
    label: str
    family: str
    folder: str
    filename: str
    source: str
    license: str
    repo: str | None = None
    repo_path: str | None = None
    size_bytes: int = 0
    sha256: str | None = None
    enabled: bool = True


@dataclass(frozen=True)
class Paths:
    models_dir: Path


def load_registry(path: Path = REGISTRY_PATH) -> list[ModelEntry]:
    """Parse the registry file into entries, rejecting unknown sources."""
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    entries = [ModelEntry(**item) for item in raw["models"]]
    for entry in entries:
        if entry.source not in ("local", "huggingface"):
            raise ValueError(f"Model {entry.id}: unknown source '{entry.source}'")
        if entry.source == "huggingface" and not (entry.repo and entry.repo_path and entry.sha256):
            raise ValueError(
                f"Model {entry.id}: huggingface entries need repo, repo_path and sha256"
            )
    return entries


def target_path(entry: ModelEntry, paths: Paths) -> Path:
    """Return the model's location inside MODELS_DIR."""
    return paths.models_dir / entry.folder / entry.filename


def model_status(entry: ModelEntry, paths: Paths) -> str:
    """Return installed or missing for either model source."""
    exists = target_path(entry, paths).is_file()
    return "installed" if exists else "missing"


def has_room(free_bytes: int, size_bytes: int, min_free_gb: float) -> bool:
    """True when downloading `size_bytes` still leaves at least `min_free_gb` free."""
    return free_bytes - size_bytes >= min_free_gb * GB


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(HASH_CHUNK_BYTES):
            digest.update(chunk)
    return digest.hexdigest()


def find_entry(entries: list[ModelEntry], model_id: str) -> ModelEntry:
    for entry in entries:
        if entry.id == model_id:
            return entry
    known = ", ".join(e.id for e in entries)
    raise SystemExit(f"Unknown model id '{model_id}'. Known ids: {known}")


def print_listing(entries: list[ModelEntry], paths: Paths) -> None:
    free_gb = shutil.disk_usage(paths.models_dir).free / GB
    print(f"Free disk space: {free_gb:.1f} GB\n")
    print(f"{'id':<22} {'family':<12} {'status':<15} {'GB':>6}  enabled  license")
    for entry in entries:
        size = f"{entry.size_bytes / GB:.2f}" if entry.size_bytes else "-"
        enabled = "yes" if entry.enabled else "no"
        status = model_status(entry, paths)
        print(
            f"{entry.id:<22} {entry.family:<12} {status:<15} "
            f"{size:>6}  {enabled:<7}  {entry.license}"
        )
        if entry.source == "local" and status == "missing":
            print(f"  Modello locale mancante. Esegui {MIGRATE_COMMAND}.")


def download(entry: ModelEntry, paths: Paths, min_free_gb: float) -> None:
    """Download one huggingface entry, verify sha256, then move it into place atomically."""
    if entry.source == "local":
        raise SystemExit(f"{entry.id}: modello locale, usa la migrazione: {MIGRATE_COMMAND}")
    from huggingface_hub import hf_hub_download

    destination = target_path(entry, paths)
    if destination.is_file():
        print(f"{entry.id}: already installed at {destination}")
        return
    free = shutil.disk_usage(paths.models_dir).free
    if not has_room(free_bytes=free, size_bytes=entry.size_bytes, min_free_gb=min_free_gb):
        raise SystemExit(
            f"{entry.id}: not enough space. Free {free / GB:.1f} GB, needed "
            f"{entry.size_bytes / GB:.2f} GB + {min_free_gb:.0f} GB margin. Nothing was downloaded."
        )
    staging = paths.models_dir / DOWNLOAD_STAGING
    staging.mkdir(parents=True, exist_ok=True)
    print(f"{entry.id}: downloading {entry.size_bytes / GB:.2f} GB from {entry.repo}")
    downloaded = Path(
        hf_hub_download(repo_id=entry.repo, filename=entry.repo_path, local_dir=staging)
    )
    actual = sha256_of(downloaded)
    if actual != entry.sha256:
        downloaded.unlink()
        raise SystemExit(f"{entry.id}: sha256 mismatch (got {actual}), file removed")
    destination.parent.mkdir(parents=True, exist_ok=True)
    downloaded.replace(destination)
    print(f"{entry.id}: installed at {destination}")


def remove(entry: ModelEntry, paths: Paths, assume_yes: bool) -> None:
    if entry.source == "local":
        raise SystemExit(f"{entry.id}: modello locale, rimozione non consentita da questo script.")
    destination = target_path(entry, paths)
    if not destination.is_file():
        print(f"{entry.id}: not installed")
        return
    if not assume_yes:
        answer = input(f"Remove {destination} ({entry.size_bytes / GB:.2f} GB)? [y/N] ")
        if answer.strip().lower() != "y":
            print("Aborted")
            return
    destination.unlink()
    print(f"{entry.id}: removed")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--list", action="store_true", help="show status of every model")
    group.add_argument("--install", nargs="+", metavar="ID", help="download the given models")
    group.add_argument(
        "--install-enabled", action="store_true", help="download every enabled model"
    )
    group.add_argument("--remove", nargs="+", metavar="ID", help="delete the given models")
    parser.add_argument(
        "--yes", action="store_true", help="do not ask for confirmation on --remove"
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    paths = Paths(
        models_dir=Path(os.environ.get("MODELS_DIR", DEFAULT_MODELS_DIR)),
    )
    paths.models_dir.mkdir(parents=True, exist_ok=True)
    min_free_gb = float(os.environ.get("MIN_FREE_DISK_GB", DEFAULT_MIN_FREE_GB))
    entries = load_registry()
    if args.list:
        print_listing(entries=entries, paths=paths)
    elif args.install or args.install_enabled:
        selected = (
            [find_entry(entries, model_id) for model_id in args.install]
            if args.install
            else [e for e in entries if e.enabled and e.source == "huggingface"]
        )
        for entry in selected:
            download(entry=entry, paths=paths, min_free_gb=min_free_gb)
    else:
        for model_id in args.remove:
            remove(entry=find_entry(entries, model_id), paths=paths, assume_yes=args.yes)
    return 0


if __name__ == "__main__":
    sys.exit(main())
