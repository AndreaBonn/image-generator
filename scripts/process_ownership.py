"""PID ownership verification shared by stop.py.

A PID recorded by start.py's run-state file can be reused by an unrelated
process after a crash and a restart: this module confirms a PID still looks
like the engine or backend this checkout started, by checking its command
line against OS-appropriate markers, before stop.py sends it any signal.

Self-contained (own OS detection, no import of platform_support) so loading
it alongside stop.py's own sibling-loading never double-registers a module
under the same `sys.modules` key.
"""

from __future__ import annotations

import platform
import subprocess
from collections.abc import Sequence

POSIX_CMDLINE_MARKERS: dict[str, Sequence[str]] = {
    "engine": ("ComfyUI", "main.py"),
    "backend": ("uvicorn", "app.main"),
}
# tasklist /FO CSV /NH exposes only the image name, never the full argv, so
# Windows cannot tell the engine from the backend this way: both kinds share
# the same (weaker) marker set. Declared limitation, see `pid_cmdline_matches`.
WINDOWS_CMDLINE_MARKERS: dict[str, Sequence[str]] = {
    "engine": ("python.exe", "uvicorn"),
    "backend": ("python.exe", "uvicorn"),
}


def _detect_os_name() -> str:
    system = platform.system().lower()
    if system == "darwin":
        return "darwin"
    if system == "windows":
        return "windows"
    return "linux"


def pid_cmdline_matches(cmdline: str, *, os_name: str, kind: str) -> bool:
    """True if `cmdline` looks like this checkout's `kind` ("engine"/"backend").

    POSIX: every marker for `kind` must be a substring of the full command
    line (`ps -p <pid> -o args=`); both markers are required because only
    the full argv reliably tells the engine apart from the backend.

    Windows: `tasklist /FO CSV /NH` exposes only the image name, not the
    full command line, so this can only confirm the PID is some Python or
    uvicorn process -- it cannot distinguish engine from backend, nor
    confirm the process belongs to this checkout. Declared limitation.
    """
    if os_name == "windows":
        return any(marker in cmdline for marker in WINDOWS_CMDLINE_MARKERS[kind])
    return all(marker in cmdline for marker in POSIX_CMDLINE_MARKERS[kind])


def real_process_cmdline(pid: int) -> str | None:
    """This PID's command line (POSIX) or `tasklist` line (Windows), or None
    if the OS has nothing to report. Used only to confirm a recorded PID
    still belongs to the process this checkout started (`pid_cmdline_matches`),
    never to search for PIDs: argv only, never a shell."""
    if _detect_os_name() == "windows":
        result = subprocess.run(
            ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
            capture_output=True,
            text=True,
            check=False,
        )
    else:
        result = subprocess.run(
            ["ps", "-p", str(pid), "-o", "args="],
            capture_output=True,
            text=True,
            check=False,
        )
    output = result.stdout.strip()
    return output or None
