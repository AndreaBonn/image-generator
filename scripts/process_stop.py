"""Graceful-then-forced process termination shared by stop.py.

Mirrors stop.sh: `kill -TERM ${pids}` sends the graceful signal to every pid
at once, then a single shared wait, then `kill -KILL` only the survivors.
Stopping N pids one at a time, each against its own full `timeout_s`, would
delay every pid after the first by however long its predecessor took to die.
"""

from __future__ import annotations

import importlib.util
import sys
import time
from collections.abc import Callable, Sequence
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location(
    "platform_support", _SCRIPT_DIR / "platform_support.py"
)
platform_support = importlib.util.module_from_spec(_spec)
sys.modules.setdefault("platform_support", platform_support)
_spec.loader.exec_module(platform_support)


def windows_kill_command(pid: int, *, force: bool) -> list[str]:
    """Build `taskkill /PID <pid> /T [/F]` from platform_support's strategy."""
    strategy = platform_support.stop_strategy("windows")
    program, *flags = strategy.force.split()  # "taskkill /T /F" -> taskkill, [/T, /F]
    if not force:
        flags = [flag for flag in flags if flag != "/F"]
    return [program, "/PID", str(pid), *flags]


def wait_for_pids_gone(
    pids: Sequence[int],
    *,
    process_exists: Callable[[int], bool],
    timeout_s: float,
    sleep: Callable[[float], None],
    clock: Callable[[], float] = time.monotonic,
) -> bool:
    """Poll until none of `pids` exist, against one shared deadline."""
    deadline = clock() + timeout_s
    while any(process_exists(pid) for pid in pids):
        if clock() >= deadline:
            return False
        sleep(1)
    return True


def _send_graceful(
    pid: int,
    *,
    os_name: str,
    send_signal: Callable[[int, str], None],
    run_command: Callable[[Sequence[str]], None],
) -> None:
    if os_name == "windows":
        run_command(windows_kill_command(pid, force=False))
    else:
        send_signal(pid, platform_support.stop_strategy(os_name).graceful)


def _send_force(
    pid: int,
    *,
    os_name: str,
    send_signal: Callable[[int, str], None],
    run_command: Callable[[Sequence[str]], None],
) -> None:
    if os_name == "windows":
        run_command(windows_kill_command(pid, force=True))
    else:
        send_signal(pid, platform_support.stop_strategy(os_name).force)


def stop_pids(
    pids: Sequence[int],
    *,
    os_name: str,
    process_exists: Callable[[int], bool],
    send_signal: Callable[[int, str], None],
    run_command: Callable[[Sequence[str]], None],
    sleep: Callable[[float], None],
    timeout_s: float,
) -> None:
    """Graceful to every pid at once, one shared wait, force only survivors."""
    for pid in pids:
        _send_graceful(pid, os_name=os_name, send_signal=send_signal, run_command=run_command)
    if wait_for_pids_gone(pids, process_exists=process_exists, timeout_s=timeout_s, sleep=sleep):
        return
    for pid in pids:
        if process_exists(pid):
            _send_force(pid, os_name=os_name, send_signal=send_signal, run_command=run_command)
    sleep(1)
