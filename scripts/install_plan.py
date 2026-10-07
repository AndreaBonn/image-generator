"""Pure planning logic for install.py: disk budget and ordered step list.

Moved out of install.py to keep that file under the project's line budget.
install.py re-exports every public name here under its own namespace, so
existing tests that call `install.plan_steps` (etc.) keep working unchanged.
"""

from __future__ import annotations

import importlib.util
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
# Matches the model-card sizes used throughout plan.md's budget table (decimal
# GB, not the binary GiB that `1024**3` would give).
DECIMAL_GB = 1_000_000_000
BASE_PROFILE_FAMILIES = frozenset({"sdxl", "upscale"})
PROFILES = ("base", "completo")


def _load_install_models() -> object:
    """Load scripts/install_models.py by path, the same way its own tests do.

    Reuses an instance already loaded by install.py, so both see one registry.
    """
    existing = sys.modules.get("install_models")
    if existing is not None:
        return existing
    path = Path(__file__).resolve().parent / "install_models.py"
    spec = importlib.util.spec_from_file_location("install_models", path)
    module = importlib.util.module_from_spec(spec)
    sys.modules["install_models"] = module
    spec.loader.exec_module(module)
    return module


install_models = _load_install_models()


def base_profile_model_ids(entries: Sequence[object]) -> frozenset[str]:
    """Model ids covered by --profile base: the SDXL family plus the upscaler."""
    return frozenset(entry.id for entry in entries if entry.family in BASE_PROFILE_FAMILIES)


def format_gb_it(value: float) -> str:
    """Round to one decimal with an Italian comma, e.g. 8.94 -> "8,9"."""
    return f"{value:.1f}".replace(".", ",")


@dataclass(frozen=True)
class DiskBudget:
    required_gb: float
    margin_gb: float
    free_gb: float

    @property
    def shortfall_gb(self) -> float:
        return max(0.0, self.required_gb + self.margin_gb - self.free_gb)

    @property
    def ok(self) -> bool:
        return self.shortfall_gb <= 0.0

    def describe(self) -> str:
        return (
            f"Servono {format_gb_it(self.required_gb)} GB richiesti + "
            f"{format_gb_it(self.margin_gb)} GB di margine, "
            f"liberi {format_gb_it(self.free_gb)} GB."
        )


def disk_budget(missing: Sequence[object], free_bytes: int, margin_gb: float) -> DiskBudget:
    """Check whether `free_bytes` covers `missing` models plus `margin_gb` headroom."""
    required_bytes = sum(model.size_bytes for model in missing)
    return DiskBudget(
        required_gb=required_bytes / DECIMAL_GB,
        margin_gb=margin_gb,
        free_gb=free_bytes / DECIMAL_GB,
    )


@dataclass(frozen=True)
class Step:
    name: str
    description: str
    # Populated only for the "models" step: exactly which ids to download,
    # already filtered by profile. Other steps leave this empty.
    model_ids: tuple[str, ...] = ()


@dataclass(frozen=True)
class InstallState:
    """Snapshot of what install.py needs to know before planning steps."""

    engine_installed: bool
    backend_deps_installed: bool
    frontend_built: bool
    missing_style_filenames: tuple[str, ...] = ()
    missing_model_ids: tuple[str, ...] = ()


def build_models_step(profile: str, missing_model_ids: tuple[str, ...]) -> Step | None:
    """Return the models step for `profile`, or None if nothing to download."""
    base_ids = base_profile_model_ids(install_models.load_registry())
    relevant = (
        tuple(model_id for model_id in missing_model_ids if model_id in base_ids)
        if profile == "base"
        else missing_model_ids
    )
    if not relevant:
        return None
    return Step(
        name="models",
        description=f"Scarica {len(relevant)} modelli del profilo {profile}: {', '.join(relevant)}",
        model_ids=relevant,
    )


def _engine_step(state: InstallState) -> Step | None:
    if state.engine_installed:
        return None
    return Step(name="engine", description="Installa il motore ComfyUI")


def _backend_deps_step(state: InstallState) -> Step | None:
    if state.backend_deps_installed:
        return None
    return Step(name="backend_deps", description="Installa le dipendenze backend (uv sync)")


def _frontend_build_step(state: InstallState) -> Step | None:
    if state.frontend_built:
        return None
    return Step(
        name="frontend_build",
        description="Compila il frontend (npm ci && npm run build)",
    )


def _styles_step(state: InstallState) -> Step | None:
    if not state.missing_style_filenames:
        return None
    return Step(
        name="styles",
        description=f"Scarica {len(state.missing_style_filenames)} file di stili",
    )


def plan_steps(profile: str, state: InstallState) -> list[Step]:
    """Return the ordered steps install.py must still run for `profile`.

    A step already satisfied in `state` is omitted, so a machine that is
    already current plans zero steps ("niente da scaricare").
    """
    if profile not in PROFILES:
        raise ValueError(f"unknown profile '{profile}', expected one of {PROFILES}")
    step_builders = (
        _engine_step,
        _backend_deps_step,
        _frontend_build_step,
        _styles_step,
    )
    steps = [step for build in step_builders if (step := build(state)) is not None]
    models_step = build_models_step(profile=profile, missing_model_ids=state.missing_model_ids)
    if models_step is not None:
        steps.append(models_step)
    return steps
