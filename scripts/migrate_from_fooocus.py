#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["pyyaml>=6.0"]
# ///
"""Migrate local models and copy styles from a Fooocus installation."""

from __future__ import annotations

import argparse
import hashlib
import os
import shutil
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
REGISTRY_PATH = REPO_ROOT / "config/models.yaml"
HASH_CHUNK_BYTES = 8 * 1024 * 1024
# Recognizable name so leftovers of an interrupted copy can be removed safely.
TEMP_PREFIX = ".migrate-tmp-"


@dataclass(frozen=True)
class Paths:
    fooocus_dir: Path
    models_dir: Path
    styles_dir: Path


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(HASH_CHUNK_BYTES):
            digest.update(chunk)
    return digest.hexdigest()


def same_filesystem(source: Path, destination: Path) -> bool:
    parent = destination.parent
    while not parent.exists():
        parent = parent.parent
    return source.stat().st_dev == parent.stat().st_dev


def check_size(path: Path, expected: int) -> None:
    actual = path.stat().st_size
    if not path.is_file() or actual != expected:
        raise ValueError(f"dimensione diversa: {path} ({actual} byte, attesi {expected})")


def publish_file(source: Path, destination: Path) -> None:
    # Reserve the name so another migration cannot win between the check and rename.
    with destination.open(mode="xb") as reservation:
        try:
            os.rename(src=source, dst=destination)
        except OSError:
            if destination.stat().st_ino == os.fstat(reservation.fileno()).st_ino:
                destination.unlink()
            raise


def copy_verified(source: Path, destination: Path, expected_hash: str) -> None:
    with tempfile.NamedTemporaryFile(dir=destination.parent, prefix=TEMP_PREFIX, delete=False) as handle:
        temporary = Path(handle.name)
    try:
        shutil.copyfile(src=source, dst=temporary)
        if sha256_of(path=temporary) != expected_hash:
            raise ValueError(f"SHA256 non corrispondente: {source}")
        publish_file(source=temporary, destination=destination)
    finally:
        temporary.unlink(missing_ok=True)


def migrate_model(entry: dict[str, Any], paths: Paths, apply: bool) -> None:
    relative = Path(entry["folder"]) / entry["filename"]
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError(f"percorso modello non relativo: {relative}")
    source = paths.fooocus_dir / "models" / relative
    destination = paths.models_dir / relative
    if destination.exists():
        check_size(path=destination, expected=entry["size_bytes"])
        print(f"Già presente: {destination}")
        return
    if not source.is_file():
        raise FileNotFoundError(f"sorgente mancante: {source}")
    check_size(path=source, expected=entry["size_bytes"])
    # A symlinked source is copied: renaming would move the link, not the model.
    move = not source.is_symlink() and same_filesystem(source=source, destination=destination)
    action = "Sposta" if move else "Copia verificata (sorgente conservata)"
    print(f"{action}: {source} -> {destination}")
    if not apply:
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    if move:
        publish_file(source=source, destination=destination)
        check_size(path=destination, expected=entry["size_bytes"])
    else:
        copy_verified(source=source, destination=destination, expected_hash=entry["sha256"])
        print(f"Copia verificata; puoi eliminare la sorgente: {source}")


def copy_style(source: Path, destination: Path, apply: bool) -> None:
    expected_hash = sha256_of(path=source)
    if destination.exists():
        if sha256_of(path=destination) != expected_hash:
            raise ValueError(f"stile con contenuto diverso, nessuna sovrascrittura: {destination}")
        print(f"Stile identico, saltato: {destination}")
        return
    print(f"Copia stile: {source} -> {destination}")
    if apply:
        destination.parent.mkdir(parents=True, exist_ok=True)
        copy_verified(source=source, destination=destination, expected_hash=expected_hash)


def migrate_models(paths: Paths, apply: bool) -> int:
    registry = yaml.safe_load(REGISTRY_PATH.read_text(encoding="utf-8"))
    errors = 0
    for entry in registry["models"]:
        if entry["source"] != "local":
            continue
        try:
            migrate_model(entry=entry, paths=paths, apply=apply)
        except (OSError, ValueError, KeyError) as error:
            print(f"Errore modello {entry.get('id', '?')}: {error}")
            errors += 1
    return errors


def migrate_styles(paths: Paths, apply: bool) -> int:
    directory = paths.fooocus_dir / "sdxl_styles"
    if not directory.is_dir():
        print(f"Errore: cartella stili sorgente mancante: {directory}")
        return 1
    errors = 0
    for source in sorted(directory.glob(pattern="*.json")):
        try:
            copy_style(source=source, destination=paths.styles_dir / source.name, apply=apply)
        except (OSError, ValueError) as error:
            print(f"Errore stile {source.name}: {error}")
            errors += 1
    return errors


def remove_orphan_temporaries(paths: Paths) -> None:
    registry = yaml.safe_load(REGISTRY_PATH.read_text(encoding="utf-8"))
    folders = {paths.models_dir / entry["folder"] for entry in registry["models"]}
    for folder in sorted(folders | {paths.styles_dir}):
        for orphan in folder.glob(pattern=f"{TEMP_PREFIX}*"):
            print(f"Rimuovo un file temporaneo di una copia interrotta: {orphan}")
            orphan.unlink(missing_ok=True)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Migra modelli e stili da Fooocus.")
    parser.add_argument(
        "--fooocus-dir",
        type=Path,
        default=Path(os.environ.get("FOOOCUS_DIR", Path.home() / "Fooocus")),
        help="Cartella Fooocus di origine (default: FOOOCUS_DIR oppure ~/Fooocus).",
    )
    parser.add_argument("--apply", action="store_true", help="Esegue il piano di migrazione.")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(args=argv)
    paths = Paths(
        fooocus_dir=args.fooocus_dir.expanduser(),
        models_dir=Path(os.environ.get("MODELS_DIR", REPO_ROOT / "engine/models")),
        styles_dir=Path(os.environ.get("DATA_DIR", REPO_ROOT / "data")) / "styles",
    )
    print("Migrazione" if args.apply else "Simulazione: nessun file verrà modificato.")
    try:
        if args.apply:
            remove_orphan_temporaries(paths=paths)
        errors = migrate_models(paths=paths, apply=args.apply)
        errors += migrate_styles(paths=paths, apply=args.apply)
    except (OSError, ValueError, KeyError, yaml.YAMLError) as error:
        print(f"Errore: {error}")
        errors = 1
    print(f"Riepilogo: {'migrazione' if args.apply else 'simulazione'}, errori: {errors}.")
    return int(errors > 0)


if __name__ == "__main__":
    sys.exit(main())
