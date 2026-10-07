"""Run-state file written by start.py, and classification of the PIDs it records.

Split out of stop.py: reading the file and deciding which recorded PIDs are
still ours is pure bookkeeping, separate from actually stopping processes.
"""

from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent


def _sibling(name: str):
    """Reuse the copy start.py/stop.py already loaded, so state stays shared."""
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, _SCRIPT_DIR / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


platform_support = _sibling("platform_support")
process_ownership = _sibling("process_ownership")
pid_cmdline_matches = process_ownership.pid_cmdline_matches


@dataclass(frozen=True)
class RunState:
    engine_pid: int | None
    backend_pid: int | None


def read_run_state(repo_root: Path) -> RunState | None:
    """Parse the run-state file, or None if it's missing or unreadable."""
    path = platform_support.run_state_path(repo_root)
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return None
    return RunState(engine_pid=data.get("engine"), backend_pid=data.get("backend"))


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


def remove_run_state_file(repo_root: Path) -> None:
    platform_support.run_state_path(repo_root).unlink(missing_ok=True)


def real_process_exists(pid: int) -> bool:
    if platform_support.detect_os_name() == "windows":
        import ctypes

        handle = ctypes.windll.kernel32.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED
        if not handle:
            return False
        ctypes.windll.kernel32.CloseHandle(handle)
        return True
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def real_run_command(argv: Sequence[str]) -> None:
    subprocess.run(list(argv), check=False)


def real_kill(pid: int, signal_name: str) -> None:
    import signal

    sig = signal.SIGTERM if signal_name == "SIGTERM" else signal.SIGKILL
    try:
        os.kill(pid, sig)
    except ProcessLookupError:
        pass


@dataclass(frozen=True)
class RecordedPidsCheck:
    """Recorded PIDs by liveness and ownership. `unverifiable`: alive but its
    command line could not be read -- "don't know", never "not ours"."""

    owned: list[int]
    unverifiable: list[tuple[str, int]]


def check_recorded_pids(
    state: RunState,
    *,
    os_name: str,
    process_exists: Callable[[int], bool],
    process_cmdline: Callable[[int], str | None],
) -> RecordedPidsCheck:
    """Classify each recorded PID: alive+ours, alive+unreadable, or ignorable
    (dead, or alive but confirmed foreign via its command line)."""
    owned: list[int] = []
    unverifiable: list[tuple[str, int]] = []
    for kind, pid in (("engine", state.engine_pid), ("backend", state.backend_pid)):
        if pid is None or not process_exists(pid):
            continue
        cmdline = process_cmdline(pid)
        if cmdline is None:
            unverifiable.append((kind, pid))
        elif pid_cmdline_matches(cmdline, os_name=os_name, kind=kind):
            owned.append(pid)
    return RecordedPidsCheck(owned=owned, unverifiable=unverifiable)
