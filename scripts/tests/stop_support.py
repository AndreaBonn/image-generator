import importlib.util
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "stop.py"
spec = importlib.util.spec_from_file_location("stop", SCRIPT)
stop_mod = importlib.util.module_from_spec(spec)
sys.modules["stop"] = stop_mod
spec.loader.exec_module(stop_mod)

pgrep_fallback = sys.modules["pgrep_fallback"]
platform_support = sys.modules["platform_support"]

REPO = Path("/repo")


def make_pgrep(sequence):
    """Returns a fake `pgrep` yielding each list in `sequence` in turn,
    then repeating the last one forever."""
    calls = iter(sequence)
    remaining = {"last": sequence[-1] if sequence else []}

    def pgrep(pattern):
        try:
            result = next(calls)
            remaining["last"] = result
            return result
        except StopIteration:
            return remaining["last"]

    return pgrep


def make_clock(start=0.0, step=1.0):
    state = {"t": start}

    def clock():
        t = state["t"]
        state["t"] += step
        return t

    return clock


def make_kill_recorder():
    sent = []

    def kill(pid, signal_name):
        sent.append((pid, signal_name))

    return kill, sent


def make_notify_recorder():
    messages = []

    def notify_send(app_name, message):
        messages.append((app_name, message))

    return notify_send, messages


def make_process_exists(alive_pids):
    """Fake liveness check: a pid is alive iff still in the mutable `alive_pids` set."""

    def process_exists(pid):
        return pid in alive_pids

    return process_exists


def engine_cmdline(pid=None):
    return "/repo/engine/ComfyUI/.venv/bin/python3.12 /repo/engine/ComfyUI/main.py --port 8188"


def backend_cmdline(pid=None):
    return "/repo/backend/.venv/bin/python /repo/backend/.venv/bin/uvicorn app.main:create_app"
