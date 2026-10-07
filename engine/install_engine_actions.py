"""Real I/O behind install_engine.py's steps: disk check, git/uv commands, the
smoke test. Split out of install_engine.py to keep that file under the
project's line budget; install_engine.py re-exports every name here, so
callers (and its tests) keep using `install_engine.<name>` unchanged.

Every subprocess call is an argument list, never `shell=True`.
"""

from __future__ import annotations

import importlib.util
import os
import shutil
import string
import subprocess
import sys
from collections.abc import Callable, Sequence
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = _SCRIPT_DIR.parent

_existing = sys.modules.get("platform_support")
if _existing is not None:
    platform_support = _existing
else:
    _spec = importlib.util.spec_from_file_location(
        "platform_support", REPO_ROOT / "scripts" / "platform_support.py"
    )
    platform_support = importlib.util.module_from_spec(_spec)
    sys.modules["platform_support"] = platform_support
    _spec.loader.exec_module(platform_support)

COMFY_REPO_URL = "https://github.com/Comfy-Org/ComfyUI.git"
COMFY_TAG = "v0.38.2"
INPAINT_NODES_REPO_URL = "https://github.com/Acly/comfyui-inpaint-nodes.git"
INPAINT_NODES_COMMIT = "5b7681746fe19e563113d27366ba85236bc1ba5b"
DECIMAL_GB = 1_000_000_000
MODEL_SUBDIRS = (
    "checkpoints",
    "diffusion_models",
    "text_encoders",
    "vae",
    "loras",
    "inpaint",
    "upscale_models",
    "background_removal",
)


def log(message: str) -> None:
    print(f"[install_engine] {message}")


class InsufficientDiskSpaceError(RuntimeError):
    pass


def assert_free_space(path: Path, min_free_gb: float) -> None:
    free_gb = shutil.disk_usage(path).free / DECIMAL_GB
    if free_gb < min_free_gb:
        raise InsufficientDiskSpaceError(
            f"Solo {free_gb:.1f} GB liberi, servono almeno {min_free_gb} GB per ComfyUI + PyTorch."
        )
    log(f"Spazio libero: {free_gb:.1f} GB")


def run_command(argv: Sequence[str], *, cwd: Path | None = None, env: dict | None = None) -> None:
    subprocess.run(list(argv), cwd=cwd, env=env, check=True)


def execute_clone_comfyui(engine_dir: Path) -> None:
    if not (engine_dir / ".git").is_dir():
        run_command(["git", "clone", "--quiet", COMFY_REPO_URL, str(engine_dir)])
    run_command(["git", "-C", str(engine_dir), "fetch", "--quiet", "--tags"])
    checkout = ["git", "-C", str(engine_dir), "-c", "advice.detachedHead=false"]
    run_command([*checkout, "checkout", "--quiet", COMFY_TAG])
    log(f"ComfyUI a {COMFY_TAG}")


def execute_create_venv(engine_dir: Path) -> None:
    run_command(["uv", "venv", "--quiet", "--python", "3.12", str(engine_dir / ".venv")])


def execute_install_deps(engine_dir: Path, os_name: str, has_nvidia: bool) -> None:
    env = {**os.environ, "VIRTUAL_ENV": str(engine_dir / ".venv")}
    index = platform_support.torch_index(os_name, has_nvidia)
    torch_cmd = ["uv", "pip", "install", "--quiet", "torch", "torchvision", "torchaudio"]
    if index:
        torch_cmd += ["--index-url", index]
    run_command(torch_cmd, env=env)
    run_command(
        ["uv", "pip", "install", "--quiet", "-r", str(engine_dir / "requirements.txt")], env=env
    )
    log("Python environment ready")


def execute_inpaint_nodes(engine_dir: Path) -> None:
    node_dir = engine_dir / "custom_nodes" / "comfyui-inpaint-nodes"
    if not (node_dir / ".git").is_dir():
        run_command(["git", "clone", "--quiet", INPAINT_NODES_REPO_URL, str(node_dir)])
    run_command(["git", "-C", str(node_dir), "fetch", "--quiet"])
    checkout = ["git", "-C", str(node_dir), "-c", "advice.detachedHead=false"]
    run_command([*checkout, "checkout", "--quiet", INPAINT_NODES_COMMIT])
    env = {**os.environ, "VIRTUAL_ENV": str(engine_dir / ".venv")}
    run_command(["uv", "pip", "install", "--quiet", "opencv-python"], env=env)
    log(f"comfyui-inpaint-nodes a {INPAINT_NODES_COMMIT[:12]}")


def execute_write_model_paths(engine_dir: Path, models_dir: Path, template_path: Path) -> None:
    for name in MODEL_SUBDIRS:
        (models_dir / name).mkdir(parents=True, exist_ok=True)
    text = string.Template(template_path.read_text(encoding="utf-8")).substitute(
        MODELS_DIR=str(models_dir)
    )
    (engine_dir / "extra_model_paths.yaml").write_text(text, encoding="utf-8")
    log(f"extra_model_paths.yaml written (models: {models_dir})")


def _stop_smoke_test_process(process: subprocess.Popen) -> None:
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()


def _comfy_launch_argv(venv_py: Path, engine_dir: Path, comfy_port: int) -> list[str]:
    return [
        str(venv_py),
        str(engine_dir / "main.py"),
        "--listen",
        "127.0.0.1",
        "--port",
        str(comfy_port),
        "--disable-auto-launch",
    ]


def execute_smoke_test(
    engine_dir: Path,
    os_name: str,
    *,
    comfy_port: int,
    timeout_s: float,
    repo_root: Path,
    start_process: Callable[..., subprocess.Popen] = platform_support.start_process,
    wait_for_url: Callable[..., None] = platform_support.wait_for_url,
) -> None:
    """Start ComfyUI, wait for /system_stats, then always stop it.

    `start_process`/`wait_for_url` are injectable so tests use a fake process
    instead of ever launching real ComfyUI.
    """
    venv_py = platform_support.venv_python(os_name, engine_dir / ".venv")
    url = f"http://127.0.0.1:{comfy_port}/system_stats"
    argv = _comfy_launch_argv(venv_py, engine_dir, comfy_port)
    process = start_process(argv, log_path=repo_root / "engine" / "smoke_test.log")
    try:
        wait_for_url(url, process, timeout_s=timeout_s)
        log(f"ComfyUI answered on {url}")
    finally:
        _stop_smoke_test_process(process)
