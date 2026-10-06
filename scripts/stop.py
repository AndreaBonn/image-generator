#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""Stop Image Generator (engine + backend) and free the GPU memory it holds.
Python port of stop.sh: see that file for the shell behaviour this mirrors.

Primary path, all platforms: read the PIDs start.py recorded in its run-state
file (`platform_support.run_state_path`) and stop exactly those, graceful
then forced via `platform_support.stop_strategy`. Fallback, POSIX only, when
that file is missing: `pgrep_fallback` hunts for this checkout's processes by
command line, same as stop.sh has always done (preserves today's behaviour
for anyone who started the engine/backend some other way).
"""

from __future__ import annotations

import importlib.util
import json
import os
import shutil
import subprocess
import sys
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent


def _load_sibling(name: str):
    spec = importlib.util.spec_from_file_location(name, _SCRIPT_DIR / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


platform_support = _load_sibling("platform_support")
pgrep_fallback = _load_sibling("pgrep_fallback")
process_ownership = _load_sibling("process_ownership")
process_stop = _load_sibling("process_stop")

APP_NAME = "Image Generator"
STOP_TIMEOUT_S = 30


def notify(message: str, *, notify_send: Callable[[str, str], None] | None = None) -> None:
    if notify_send is None:
        notify_send = _real_notify_send
    notify_send(APP_NAME, message)
    print(f"[image-generator] {message}")


def _real_notify_send(app_name: str, message: str) -> None:
    if shutil.which("notify-send") is None:
        return
    subprocess.run(["notify-send", f"--app-name={app_name}", app_name, message], check=False)


# --- run-state path (all platforms) --------------------------------------


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


def remove_run_state_file(repo_root: Path) -> None:
    platform_support.run_state_path(repo_root).unlink(missing_ok=True)


pid_cmdline_matches = process_ownership.pid_cmdline_matches
real_process_cmdline = process_ownership.real_process_cmdline


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


windows_kill_command = process_stop.windows_kill_command
wait_for_pids_gone = process_stop.wait_for_pids_gone
stop_pids = process_stop.stop_pids


def owned_recorded_pids(
    state: RunState,
    *,
    os_name: str,
    process_exists: Callable[[int], bool],
    process_cmdline: Callable[[int], str | None],
) -> list[int]:
    """Recorded PIDs that are alive and still run our engine or backend."""
    owned: list[int] = []
    for kind, pid in (("engine", state.engine_pid), ("backend", state.backend_pid)):
        if pid is None or not process_exists(pid):
            continue
        cmdline = process_cmdline(pid)
        if cmdline is not None and pid_cmdline_matches(cmdline, os_name=os_name, kind=kind):
            owned.append(pid)
    return owned


def stop_via_run_state(
    repo_root: Path,
    state: RunState,
    *,
    os_name: str,
    process_exists: Callable[[int], bool] = real_process_exists,
    process_cmdline: Callable[[int], str | None] = real_process_cmdline,
    send_signal: Callable[[int, str], None] = real_kill,
    run_command: Callable[[Sequence[str]], None] = real_run_command,
    sleep: Callable[[float], None] = time.sleep,
    timeout_s: float = STOP_TIMEOUT_S,
    notify_send: Callable[[str, str], None] | None = None,
) -> int:
    """Stop the PIDs recorded by start.py. Drops the file when done either way.

    Each recorded PID must be both alive and ownership-checked via its
    command line (`pid_cmdline_matches`): after a crash and a restart, a PID
    can be reused by an unrelated process, and the bare liveness check alone
    would signal that foreign process instead of skipping it.
    """
    owned_pids = owned_recorded_pids(
        state, os_name=os_name, process_exists=process_exists, process_cmdline=process_cmdline
    )
    if not owned_pids:
        remove_run_state_file(repo_root)
        was_recorded = state.engine_pid is not None or state.backend_pid is not None
        notify(
            "File di stato obsoleto: rimosso." if was_recorded else "Non era in esecuzione.",
            notify_send=notify_send,
        )
        return 0

    stop_pids(
        owned_pids,
        os_name=os_name,
        process_exists=process_exists,
        send_signal=send_signal,
        run_command=run_command,
        sleep=sleep,
        timeout_s=timeout_s,
    )

    remove_run_state_file(repo_root)
    if any(process_exists(pid) for pid in owned_pids):
        notify(
            "Alcuni processi non si chiudono nemmeno forzandoli: riavvia il computer.",
            notify_send=notify_send,
        )
        return 1
    notify("Chiuso. La memoria della scheda video è libera.", notify_send=notify_send)
    return 0


# --- dispatcher -------------------------------------------------------------


def stop(
    repo_root: Path,
    *,
    os_name: str | None = None,
    read_run_state: Callable[[Path], RunState | None] = read_run_state,
    pgrep: Callable[[str], Sequence[int]] = pgrep_fallback.real_pgrep,
    process_exists: Callable[[int], bool] = real_process_exists,
    process_cmdline: Callable[[int], str | None] = real_process_cmdline,
    send_signal: Callable[[int, str], None] = real_kill,
    run_command: Callable[[Sequence[str]], None] = real_run_command,
    sleep: Callable[[float], None] = time.sleep,
    clock: Callable[[], float] = time.monotonic,
    timeout_s: float = STOP_TIMEOUT_S,
    notify_send: Callable[[str, str], None] | None = None,
) -> int:
    """Stop this checkout's engine and backend. Returns the process exit code."""
    if os_name is None:
        os_name = platform_support.detect_os_name()

    state = read_run_state(repo_root)
    if state is not None:
        return stop_via_run_state(
            repo_root,
            state,
            os_name=os_name,
            process_exists=process_exists,
            process_cmdline=process_cmdline,
            send_signal=send_signal,
            run_command=run_command,
            sleep=sleep,
            timeout_s=timeout_s,
            notify_send=notify_send,
        )

    if os_name == "windows":
        # No pgrep on Windows, and no prior stop.sh behaviour to preserve there.
        notify("Non era in esecuzione.", notify_send=notify_send)
        return 0

    return pgrep_fallback.stop_via_pgrep(
        repo_root,
        pgrep=pgrep,
        kill=send_signal,
        notify=lambda message: notify(message, notify_send=notify_send),
        sleep=sleep,
        clock=clock,
        timeout_s=timeout_s,
    )


def main(argv: Sequence[str] | None = None) -> int:
    repo_root = _SCRIPT_DIR.parent
    return stop(repo_root)


if __name__ == "__main__":
    sys.exit(main())
