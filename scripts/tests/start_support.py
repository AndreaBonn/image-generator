import importlib.util
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "start.py"
spec = importlib.util.spec_from_file_location("start", SCRIPT)
start = importlib.util.module_from_spec(spec)
sys.modules["start"] = start
spec.loader.exec_module(start)

platform_support = sys.modules["platform_support"]


class FakeProcess:
    """Stand-in for subprocess.Popen, fully controlled by the test."""

    def __init__(self, pid: int, *, dead: bool = False, returncode: int | None = None):
        self.pid = pid
        self.terminated = False
        self.killed = False
        self._returncode = returncode if returncode is not None else (1 if dead else None)
        self._dead = dead

    def poll(self):
        return self._returncode if self._dead else (self._returncode if self.terminated else None)

    def terminate(self):
        self.terminated = True
        self._returncode = 0

    def kill(self):
        self.killed = True
        self._returncode = -9

    def wait(self, timeout=None):
        return self._returncode


CONFIG = start.StartConfig(repo_root=Path("/repo"), os_name="linux", comfy_port=8188, app_port=8000)
