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
import shutil
import subprocess
import sys
import time
from collections.abc import Callable, Sequence
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


recorded_pids = _load_sibling("recorded_pids")

RunState = recorded_pids.RunState
RecordedPidsCheck = recorded_pids.RecordedPidsCheck
read_run_state = recorded_pids.read_run_state
remove_run_state_file = recorded_pids.remove_run_state_file
check_recorded_pids = recorded_pids.check_recorded_pids
real_process_exists = recorded_pids.real_process_exists
real_run_command = recorded_pids.real_run_command
real_kill = recorded_pids.real_kill
pid_cmdline_matches = process_ownership.pid_cmdline_matches
real_process_cmdline = process_ownership.real_process_cmdline

windows_kill_command = process_stop.windows_kill_command
wait_for_pids_gone = process_stop.wait_for_pids_gone
stop_pids = process_stop.stop_pids


def _notify_unverifiable_pids(
    check: RecordedPidsCheck,
    notify_send: Callable[[str, str], None] | None,
) -> int:
    """Alive but unreadable: do not touch it, keep the state file so the PID
    is not lost, and tell the user to deal with it by hand."""
    pid_list = ", ".join(str(pid) for _, pid in check.unverifiable)
    notify(
        f"Il processo {pid_list} è attivo ma non posso verificare che sia di "
        f"{APP_NAME}: fermalo a mano o riavvia.",
        notify_send=notify_send,
    )
    return 1


def _notify_no_owned_pids(
    repo_root: Path,
    state: RunState,
    notify_send: Callable[[str, str], None] | None,
) -> int:
    remove_run_state_file(repo_root)
    was_recorded = state.engine_pid is not None or state.backend_pid is not None
    notify(
        "File di stato obsoleto: rimosso." if was_recorded else "Non era in esecuzione.",
        notify_send=notify_send,
    )
    return 0


def _stop_owned_pids(
    repo_root: Path,
    owned_pids: list[int],
    *,
    os_name: str,
    process_exists: Callable[[int], bool],
    send_signal: Callable[[int, str], None],
    run_command: Callable[[Sequence[str]], None],
    sleep: Callable[[float], None],
    timeout_s: float,
    notify_send: Callable[[str, str], None] | None,
) -> int:
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


def _short_circuit_stop(
    check: RecordedPidsCheck,
    repo_root: Path,
    state: RunState,
    notify_send: Callable[[str, str], None] | None,
) -> int | None:
    """Exit code if nothing should be stopped (unverifiable, or none owned)."""
    if check.unverifiable:
        return _notify_unverifiable_pids(check, notify_send)
    if not check.owned:
        return _notify_no_owned_pids(repo_root, state, notify_send)
    return None


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
    """Stop the PIDs recorded by start.py, unless a PID is unverifiable."""
    check = check_recorded_pids(
        state, os_name=os_name, process_exists=process_exists, process_cmdline=process_cmdline
    )
    if (early := _short_circuit_stop(check, repo_root, state, notify_send)) is not None:
        return early
    return _stop_owned_pids(
        repo_root,
        check.owned,
        os_name=os_name,
        process_exists=process_exists,
        send_signal=send_signal,
        run_command=run_command,
        sleep=sleep,
        timeout_s=timeout_s,
        notify_send=notify_send,
    )


# --- dispatcher -------------------------------------------------------------


def _stop_without_run_state(
    repo_root: Path,
    *,
    os_name: str,
    pgrep: Callable[[str], Sequence[int]],
    send_signal: Callable[[int, str], None],
    sleep: Callable[[float], None],
    clock: Callable[[], float],
    timeout_s: float,
    notify_send: Callable[[str, str], None] | None,
) -> int:
    """No run-state file: pgrep hunt (POSIX only, no prior stop.sh behaviour
    on Windows to preserve)."""
    if os_name == "windows":
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


def _stop_shared_kwargs(
    os_name: str,
    send_signal: Callable[[int, str], None],
    sleep: Callable[[float], None],
    timeout_s: float,
    notify_send: Callable[[str, str], None] | None,
) -> dict[str, object]:
    """Kwargs shared by `stop_via_run_state` and `_stop_without_run_state`."""
    return {
        "os_name": os_name,
        "send_signal": send_signal,
        "sleep": sleep,
        "timeout_s": timeout_s,
        "notify_send": notify_send,
    }


def _stop_run_state_only_kwargs(
    process_exists: Callable[[int], bool],
    process_cmdline: Callable[[int], str | None],
    run_command: Callable[[Sequence[str]], None],
) -> dict[str, object]:
    """Kwargs only `stop_via_run_state` needs, beyond `_stop_shared_kwargs`."""
    return {
        "process_exists": process_exists,
        "process_cmdline": process_cmdline,
        "run_command": run_command,
    }


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
    os_name = os_name or platform_support.detect_os_name()
    state = read_run_state(repo_root)
    shared = _stop_shared_kwargs(os_name, send_signal, sleep, timeout_s, notify_send)
    if state is not None:
        run_state_only = _stop_run_state_only_kwargs(process_exists, process_cmdline, run_command)
        return stop_via_run_state(repo_root, state, **shared, **run_state_only)
    return _stop_without_run_state(repo_root, pgrep=pgrep, clock=clock, **shared)


def main(argv: Sequence[str] | None = None) -> int:
    repo_root = _SCRIPT_DIR.parent
    return stop(repo_root)


if __name__ == "__main__":
    sys.exit(main())
