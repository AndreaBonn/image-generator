#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""Cross-platform port of install_engine.sh: installs (or repairs) the headless
ComfyUI engine plus the one custom node Studio Immagini needs.

Planning is pure (`plan_install`) and parametrized by OS and detected state, so
all three platforms are exercised by tests on this machine; only Linux runs the
real git/uv/ComfyUI commands here (Windows/macOS execution is NV, see tasks.md
Fase 7). `--dry-run` prints the plan without running anything. Real I/O
(subprocess calls, the smoke test) lives in install_engine_actions.py and is
re-exported here so existing call sites don't need to know about the split.
"""

from __future__ import annotations

import argparse
import importlib.util
import os
import shutil
import sys
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = _SCRIPT_DIR.parent


def _load_sibling(module_name: str) -> object:
    path = _SCRIPT_DIR / f"{module_name}.py"
    spec = importlib.util.spec_from_file_location(module_name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


actions = _load_sibling("install_engine_actions")
platform_support = sys.modules["platform_support"]

# Re-exported so tests (and `main`) call `install_engine.<name>` directly.
InsufficientDiskSpaceError = actions.InsufficientDiskSpaceError
MODEL_SUBDIRS = actions.MODEL_SUBDIRS
assert_free_space = actions.assert_free_space
run_command = actions.run_command
execute_clone_comfyui = actions.execute_clone_comfyui
execute_create_venv = actions.execute_create_venv
execute_install_deps = actions.execute_install_deps
execute_inpaint_nodes = actions.execute_inpaint_nodes
execute_write_model_paths = actions.execute_write_model_paths
execute_smoke_test = actions.execute_smoke_test

COMFY_TAG = actions.COMFY_TAG
INPAINT_NODES_COMMIT = actions.INPAINT_NODES_COMMIT
MIN_FREE_GB_FOR_ENGINE = 10
STARTUP_TIMEOUT_S = 120.0
TEMPLATE_PATH = REPO_ROOT / "config" / "comfy" / "extra_model_paths.yaml.template"


def log(message: str) -> None:
    print(f"[install_engine] {message}")


# --- pure planning (T095) ----------------------------------------------------


@dataclass(frozen=True)
class EngineState:
    comfy_cloned: bool
    venv_ready: bool
    deps_installed: bool
    inpaint_node_cloned: bool
    model_paths_written: bool


@dataclass(frozen=True)
class Step:
    name: str
    description: str
    done: bool


def plan_install(os_name: str, has_nvidia: bool, state: EngineState) -> list[Step]:
    """Ordered steps to install/repair the engine; already-done ones carry `done=True`.

    `space_check` and `smoke_test` are never marked done: like install_engine.sh,
    they always re-run (cheap, and the point of a smoke test is to re-check).
    """
    index = platform_support.torch_index(os_name, has_nvidia)
    torch_desc = (
        f"Installa PyTorch e requirements ({index})"
        if index
        else "Installa PyTorch e requirements (MPS, nessun indice)"
    )
    return [
        Step("space_check", f"Verifica spazio libero (>= {MIN_FREE_GB_FOR_ENGINE} GB)", False),
        Step("clone_comfyui", f"Clona/aggiorna ComfyUI a {COMFY_TAG}", state.comfy_cloned),
        Step("venv", "Crea virtualenv (python 3.12)", state.venv_ready),
        Step("torch_and_requirements", torch_desc, state.deps_installed),
        Step(
            "inpaint_nodes",
            f"Clona/pin comfyui-inpaint-nodes a {INPAINT_NODES_COMMIT[:12]} + opencv-python",
            state.inpaint_node_cloned,
        ),
        Step("model_paths", "Scrive extra_model_paths.yaml", state.model_paths_written),
        Step("smoke_test", "Smoke test: avvio, /system_stats, arresto", False),
    ]


# --- real detection (I/O, not pure) -------------------------------------------


def has_nvidia_gpu() -> bool:
    return shutil.which("nvidia-smi") is not None


def _torch_site_packages_dirs(venv_dir: Path, os_name: str) -> list[Path]:
    if os_name == "windows":
        return [venv_dir / "Lib" / "site-packages"]
    return list(venv_dir.glob("lib/python3.*/site-packages"))


def detect_engine_state(engine_dir: Path, os_name: str) -> EngineState:
    """Read the filesystem for what is already installed; no process spawned."""
    venv_dir = engine_dir / ".venv"
    deps_installed = any(
        (d / "torch").is_dir() for d in _torch_site_packages_dirs(venv_dir, os_name)
    )
    return EngineState(
        comfy_cloned=(engine_dir / ".git").is_dir(),
        venv_ready=platform_support.venv_python(os_name, venv_dir).exists(),
        deps_installed=deps_installed,
        inpaint_node_cloned=(
            engine_dir / "custom_nodes" / "comfyui-inpaint-nodes" / ".git"
        ).is_dir(),
        model_paths_written=(engine_dir / "extra_model_paths.yaml").is_file(),
    )


# --- orchestration -------------------------------------------------------------


def _run_smoke_test_step(
    *, engine_dir: Path, os_name: str, comfy_port: int, timeout_s: float, repo_root: Path
) -> None:
    if os.environ.get("SKIP_SMOKE_TEST") == "1":
        log("Smoke test saltato (SKIP_SMOKE_TEST=1)")
        return
    execute_smoke_test(
        engine_dir, os_name, comfy_port=comfy_port, timeout_s=timeout_s, repo_root=repo_root
    )


def execute_step(
    step: Step,
    *,
    engine_dir: Path,
    os_name: str,
    has_nvidia: bool,
    models_dir: Path,
    repo_root: Path,
    comfy_port: int,
    timeout_s: float,
) -> None:
    handlers: dict[str, Callable[[], None]] = {
        "space_check": lambda: assert_free_space(repo_root, MIN_FREE_GB_FOR_ENGINE),
        "clone_comfyui": lambda: execute_clone_comfyui(engine_dir),
        "venv": lambda: execute_create_venv(engine_dir),
        "torch_and_requirements": lambda: execute_install_deps(engine_dir, os_name, has_nvidia),
        "inpaint_nodes": lambda: execute_inpaint_nodes(engine_dir),
        "model_paths": lambda: execute_write_model_paths(engine_dir, models_dir, TEMPLATE_PATH),
        "smoke_test": lambda: _run_smoke_test_step(
            engine_dir=engine_dir,
            os_name=os_name,
            comfy_port=comfy_port,
            timeout_s=timeout_s,
            repo_root=repo_root,
        ),
    }
    handler = handlers.get(step.name)
    if handler is None:
        raise ValueError(f"passo sconosciuto: {step.name}")
    handler()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="mostra i passi senza eseguirli")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    engine_dir = REPO_ROOT / "engine" / "ComfyUI"
    os_name = platform_support.detect_os_name()
    has_nvidia = has_nvidia_gpu()
    models_dir = Path(os.environ.get("MODELS_DIR", REPO_ROOT / "engine" / "models"))
    comfy_port = int(os.environ.get("COMFY_PORT", "8188"))

    state = detect_engine_state(engine_dir, os_name)
    steps = plan_install(os_name, has_nvidia, state)

    for step in steps:
        suffix = " (già fatto)" if step.done else ""
        log(f"{step.description}{suffix}")
        if args.dry_run or step.done:
            continue
        execute_step(
            step,
            engine_dir=engine_dir,
            os_name=os_name,
            has_nvidia=has_nvidia,
            models_dir=models_dir,
            repo_root=REPO_ROOT,
            comfy_port=comfy_port,
            timeout_s=STARTUP_TIMEOUT_S,
        )
    log("Done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
