"""POSIX-only legacy process discovery for stop.py.

Finds this checkout's engine/backend by matching their command line with
`pgrep`, exactly as stop.sh has always done. stop.py only falls back to this
module when start.py's run-state file (`platform_support.run_state_path`) is
missing, so a user who started the engine/backend some other way still gets
today's behaviour.
"""

from __future__ import annotations

import re
import subprocess
from collections.abc import Callable, Sequence
from pathlib import Path


def own_process_pattern(repo_root: Path) -> str:
    """Regex matching only this checkout's engine/backend command lines.

    Anchored at the start of the command (interpreter + absolute script
    path), so an editor or a `tail` on these files never matches.
    """
    repo = re.escape(str(repo_root))
    return (
        rf"^(bash {repo}/scripts/start\.sh"
        rf"|{repo}/engine/ComfyUI/\.venv/bin/python[0-9.]* {repo}/engine/ComfyUI/main\.py"
        rf"|{repo}/backend/\.venv/bin/python[0-9.]* {repo}/backend/\.venv/bin/uvicorn)( |$)"
    )


def own_pids(repo_root: Path, *, pgrep: Callable[[str], Sequence[int]]) -> Sequence[int]:
    return pgrep(own_process_pattern(repo_root))


def real_pgrep(pattern: str) -> Sequence[int]:
    result = subprocess.run(
        ["pgrep", "-f", "--", pattern], capture_output=True, text=True, check=False
    )
    return [int(pid) for pid in result.stdout.split()]


def send_signal(pids: Sequence[int], signal_name: str, *, kill: Callable[[int, str], None]) -> None:
    for pid in pids:
        kill(pid, signal_name)


def wait_until_gone(
    repo_root: Path,
    *,
    pgrep: Callable[[str], Sequence[int]],
    timeout_s: float,
    sleep: Callable[[float], None],
    clock: Callable[[], float],
) -> bool:
    """Poll `own_pids` until empty. Returns False if `timeout_s` is exceeded."""
    deadline = clock() + timeout_s
    while own_pids(repo_root, pgrep=pgrep):
        if clock() >= deadline:
            return False
        sleep(1)
    return True


def stop_via_pgrep(
    repo_root: Path,
    *,
    pgrep: Callable[[str], Sequence[int]],
    kill: Callable[[int, str], None],
    notify: Callable[[str], None],
    sleep: Callable[[float], None],
    clock: Callable[[], float],
    timeout_s: float,
) -> int:
    """Legacy discovery: find this checkout's processes by command line."""
    pids = own_pids(repo_root, pgrep=pgrep)
    if not pids:
        notify("Non era in esecuzione.")
        return 0

    send_signal(pids, "SIGTERM", kill=kill)
    if not wait_until_gone(repo_root, pgrep=pgrep, timeout_s=timeout_s, sleep=sleep, clock=clock):
        pids = own_pids(repo_root, pgrep=pgrep)
        send_signal(pids, "SIGKILL", kill=kill)
        sleep(1)
        if own_pids(repo_root, pgrep=pgrep):
            notify("Alcuni processi non si chiudono nemmeno forzandoli: riavvia il computer.")
            return 1

    notify("Chiuso. La memoria della scheda video è libera.")
    return 0
