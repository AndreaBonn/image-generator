"""Pure, OS-parametrized helpers for the Python ports of the shell scripts.

Every function takes the OS name as a plain string (`"linux"`, `"darwin"`,
`"windows"`) instead of reading `sys.platform` itself, so all three platforms
are exercised by tests on this machine. Only `wait_for_url`, `start_process`
and `detect_os_name` touch the outside world (sockets, subprocesses, the
running platform); everything else is a pure lookup.
"""

from __future__ import annotations

import platform
import subprocess
import time
import urllib.request
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

SUPPORTED_OS_NAMES = ("linux", "darwin", "windows")
DEFAULT_POLL_INTERVAL_S = 0.1


def _check_os_name(os_name: str) -> None:
    if os_name not in SUPPORTED_OS_NAMES:
        raise ValueError(f"unknown os_name '{os_name}', expected one of {SUPPORTED_OS_NAMES}")


def venv_python(os_name: str, venv_dir: Path) -> Path:
    """Path to a venv's Python interpreter, which differs only on Windows."""
    _check_os_name(os_name)
    if os_name == "windows":
        return venv_dir / "Scripts" / "python.exe"
    return venv_dir / "bin" / "python"


def torch_index(os_name: str, has_nvidia: bool) -> str | None:
    """PyTorch wheel index for `os_name`, or None to use the default (MPS)."""
    _check_os_name(os_name)
    if os_name == "darwin":
        return None
    if has_nvidia:
        return "https://download.pytorch.org/whl/cu130"
    return "https://download.pytorch.org/whl/cpu"


@dataclass(frozen=True)
class StopStrategy:
    """How to stop a process tree on an OS; a description, not an action.

    Callers (start.py/stop.py) read `graceful` and `force` and execute the
    matching mechanism themselves: this module never sends a signal or
    spawns `taskkill`.
    """

    graceful: str
    force: str


def stop_strategy(os_name: str) -> StopStrategy:
    """Graceful and forceful shutdown mechanism for `os_name`."""
    _check_os_name(os_name)
    if os_name == "windows":
        return StopStrategy(graceful="terminate", force="taskkill /T /F")
    return StopStrategy(graceful="SIGTERM", force="SIGKILL")


def launcher_kind(os_name: str) -> str:
    """Quick-launch file format native to `os_name`."""
    _check_os_name(os_name)
    if os_name == "windows":
        return "cmd"
    if os_name == "darwin":
        return "command"
    return "desktop"


def detect_os_name() -> str:
    """Map the running platform to the os_name values this module expects."""
    system = platform.system().lower()
    if system == "darwin":
        return "darwin"
    if system == "windows":
        return "windows"
    return "linux"


def run_state_path(repo_root: Path) -> Path:
    """Where start.py records the PIDs it launched, for stop.py to read."""
    return repo_root / "engine" / "run" / "studio.pids"


class ProcessExitedError(RuntimeError):
    """Raised by `wait_for_url` when the watched process exits first."""

    def __init__(self, returncode: int | None) -> None:
        self.returncode = returncode
        super().__init__(f"process exited (code {returncode}) before responding")


def wait_for_url(
    url: str,
    process: subprocess.Popen,
    *,
    timeout_s: float,
    poll_interval_s: float = DEFAULT_POLL_INTERVAL_S,
) -> None:
    """Poll `url` until it answers; raise at once if `process` dies first.

    Parameters
    ----------
    url : str
        Address to poll (e.g. a health endpoint).
    process : subprocess.Popen
        The process expected to serve `url`. Checked before every poll via
        `poll()`, so a process that crashes fails immediately instead of
        waiting out `timeout_s`.
    timeout_s : float
        Overall budget. Raises `TimeoutError` once exceeded.
    poll_interval_s : float
        Delay between polls, and the per-request network timeout.
    """
    deadline = time.monotonic() + timeout_s
    while True:
        returncode = process.poll()
        if returncode is not None:
            raise ProcessExitedError(returncode)
        try:
            urllib.request.urlopen(url, timeout=poll_interval_s)
            return
        except OSError:
            pass
        if time.monotonic() >= deadline:
            raise TimeoutError(f"{url} did not respond within {timeout_s}s")
        time.sleep(poll_interval_s)


def start_process(
    argv: Sequence[str],
    *,
    log_path: Path,
    cwd: Path | None = None,
) -> subprocess.Popen:
    """Start `argv` as a subprocess, never through a shell.

    Stdout and stderr are both redirected to `log_path`, append-free (one
    fresh file per start), so a crash leaves a readable trail behind. The
    file is opened in a `with` block: Popen duplicates its descriptor for
    the child before returning, so closing the parent's handle right after
    does not affect what the child writes to.
    """
    with open(log_path, "wb") as log_file:
        return subprocess.Popen(
            list(argv),
            stdout=log_file,
            stderr=subprocess.STDOUT,
            cwd=cwd,
        )
