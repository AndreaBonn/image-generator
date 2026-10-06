#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""Start the engine (if not already running) and the backend; Ctrl+C stops only
those two. Python port of start.sh: see that file for the shell behaviour this
mirrors.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import subprocess
import sys
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location(
    "platform_support", _SCRIPT_DIR / "platform_support.py"
)
platform_support = importlib.util.module_from_spec(_spec)
sys.modules["platform_support"] = platform_support
_spec.loader.exec_module(platform_support)

DEFAULT_STARTUP_TIMEOUT_S = 120.0
DEFAULT_STOP_TIMEOUT_S = 10.0
OLLAMA_WARNING = (
    "ATTENZIONE: Ollama ha un modello caricato sulla scheda video.\n"
    "Generare insieme a Ollama ha già causato un blocco della GPU: "
    "chiudi il modello con 'ollama stop <nome>'."
)


def log(message: str) -> None:
    print(f"[studio] {message}")


@dataclass(frozen=True)
class StartConfig:
    repo_root: Path
    os_name: str
    comfy_port: int
    app_port: int
    startup_timeout_s: float = DEFAULT_STARTUP_TIMEOUT_S


def default_running_ollama_models() -> Sequence[str]:
    """Running Ollama models, or [] if the command is absent or lists none."""
    try:
        result = subprocess.run(
            ["ollama", "ps"], capture_output=True, text=True, timeout=5, check=False
        )
    except FileNotFoundError:
        return []
    lines = [line for line in result.stdout.splitlines()[1:] if line.strip()]
    return lines


def ollama_warning(running_models: Sequence[str]) -> str | None:
    """Warning text if `running_models` is non-empty, else None."""
    return OLLAMA_WARNING if running_models else None


def needs_frontend_build(repo_root: Path, *, force: bool) -> bool:
    return force or not (repo_root / "frontend" / "dist" / "index.html").is_file()


def npm_executable(os_name: str) -> str:
    return "npm.cmd" if os_name == "windows" else "npm"


def build_frontend(repo_root: Path, *, npm_cmd: str) -> None:
    """Run `npm ci` then `npm run build` in frontend/, argv-list only."""
    frontend_dir = repo_root / "frontend"
    subprocess.run([npm_cmd, "ci", "--silent"], cwd=frontend_dir, check=True)
    subprocess.run([npm_cmd, "run", "build", "--silent"], cwd=frontend_dir, check=True)


def is_url_responding(url: str, *, timeout_s: float = 1.0) -> bool:
    import urllib.request

    try:
        urllib.request.urlopen(url, timeout=timeout_s)
        return True
    except OSError:
        return False


class EngineNotInstalledError(RuntimeError):
    pass


def start_engine(
    config: StartConfig,
    *,
    start_process: Callable[..., subprocess.Popen] = platform_support.start_process,
    wait_for_url: Callable[..., None] = platform_support.wait_for_url,
    is_responding: Callable[[str], bool] = is_url_responding,
    on_started: Callable[[subprocess.Popen], None] = lambda process: None,
) -> subprocess.Popen | None:
    """Start the engine unless it already answers on `comfy_port`.

    `on_started` fires right after the spawn, before `wait_for_url`: a slow
    engine that times out (or exits before answering) must already be known
    to the caller's cleanup list, or it survives as an orphan holding the GPU.

    Returns the new process, or None when an engine was already running
    (so the caller never adds a foreign PID to its own cleanup list).
    """
    url = f"http://127.0.0.1:{config.comfy_port}/system_stats"
    if is_responding(url):
        log(f"Motore già attivo sulla porta {config.comfy_port}")
        return None
    engine_dir = config.repo_root / "engine" / "ComfyUI"
    venv_py = platform_support.venv_python(config.os_name, engine_dir / ".venv")
    if not venv_py.exists():
        raise EngineNotInstalledError(
            "Motore non installato: esegui prima ./engine/install_engine.sh"
        )
    log("Avvio il motore ComfyUI...")
    process = start_process(
        [
            str(venv_py),
            str(engine_dir / "main.py"),
            "--listen",
            "127.0.0.1",
            "--port",
            str(config.comfy_port),
            "--disable-auto-launch",
        ],
        log_path=config.repo_root / "engine" / "comfy.log",
    )
    on_started(process)
    wait_for_url(url, process, timeout_s=config.startup_timeout_s)
    log("Motore pronto")
    return process


def start_process_inherit_output(
    argv: Sequence[str], *, cwd: Path | None = None
) -> subprocess.Popen:
    """Start `argv` sharing this process's stdout/stderr (no capture, no file).

    Used for the backend so its logs land on the terminal, like start.sh's
    `&`-backgrounded backend does. Never through a shell.
    """
    return subprocess.Popen(list(argv), cwd=cwd)


def start_backend(
    config: StartConfig,
    *,
    start_process: Callable[..., subprocess.Popen] = start_process_inherit_output,
    wait_for_url: Callable[..., None] = platform_support.wait_for_url,
    on_started: Callable[[subprocess.Popen], None] = lambda process: None,
) -> subprocess.Popen:
    """Start the backend. `on_started` fires right after the spawn, before
    `wait_for_url`: see `start_engine` for why the ordering matters."""
    url = f"http://127.0.0.1:{config.app_port}/api/v1/health"
    log("Avvio l'applicazione...")
    process = start_process(
        [
            "uv",
            "run",
            "uvicorn",
            "app.main:create_app",
            "--factory",
            "--host",
            "127.0.0.1",
            "--port",
            str(config.app_port),
        ],
        cwd=config.repo_root / "backend",
    )
    on_started(process)
    wait_for_url(url, process, timeout_s=config.startup_timeout_s)
    log(f"Pronto: apri http://127.0.0.1:{config.app_port}")
    return process


def write_run_state(repo_root: Path, *, engine_pid: int | None, backend_pid: int | None) -> None:
    """Atomically record the PIDs this invocation started, for stop.py.

    Called once per process as soon as it is registered (see `main`), not
    only once both are up: `backend_pid` is `None` while the engine has
    started but the backend has not yet, so a crash between the two still
    leaves a run-state file stop.py can act on.
    """
    path = platform_support.run_state_path(repo_root)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_name(path.name + ".tmp")
    tmp_path.write_text(json.dumps({"engine": engine_pid, "backend": backend_pid}))
    os.replace(tmp_path, path)


def remove_run_state(repo_root: Path) -> None:
    platform_support.run_state_path(repo_root).unlink(missing_ok=True)


def stop_started_processes(
    processes: Sequence[subprocess.Popen],
    *,
    os_name: str,
    timeout_s: float = DEFAULT_STOP_TIMEOUT_S,
) -> None:
    """Stop exactly `processes`, never anything else. Graceful then forced."""
    platform_support.stop_strategy(os_name)  # validates os_name; data is unused here
    alive = [p for p in processes if p.poll() is None]
    for process in alive:
        process.terminate()
    for process in alive:
        try:
            process.wait(timeout=timeout_s)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)


def parse_args(argv: Sequence[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--build", action="store_true")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    repo_root = _SCRIPT_DIR.parent
    os_name = platform_support.detect_os_name()
    config = StartConfig(
        repo_root=repo_root,
        os_name=os_name,
        comfy_port=int(os.environ.get("COMFY_PORT", "8188")),
        app_port=int(os.environ.get("PORT", "8000")),
    )

    warning = ollama_warning(default_running_ollama_models())
    if warning:
        log(warning)

    if needs_frontend_build(repo_root, force=args.build):
        log("Compilo l'interfaccia (frontend/dist)...")
        build_frontend(repo_root, npm_cmd=npm_executable(os_name))

    started: list[subprocess.Popen] = []
    run_state: dict[str, int | None] = {"engine": None, "backend": None}

    def register(process: subprocess.Popen, *, key: str) -> None:
        """Record `process` for cleanup and persist it, before any wait that
        could block or raise: an orphan must be stoppable from the moment
        it exists, not only once start-up fully succeeds (see start_engine
        and start_backend docstrings)."""
        started.append(process)
        run_state[key] = process.pid
        write_run_state(repo_root, engine_pid=run_state["engine"], backend_pid=run_state["backend"])

    try:
        start_engine(config, on_started=lambda p: register(p, key="engine"))
        backend_process = start_backend(config, on_started=lambda p: register(p, key="backend"))
        backend_process.wait()
    except (
        platform_support.ProcessExitedError,
        TimeoutError,
        EngineNotInstalledError,
        OSError,
    ) as exc:
        log(f"Errore: {exc}")
        return 1
    except KeyboardInterrupt:
        pass
    finally:
        stop_started_processes(started, os_name=os_name)
        remove_run_state(repo_root)
    return 0


if __name__ == "__main__":
    sys.exit(main())
