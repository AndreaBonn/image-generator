import http.server
import importlib.util
import sys
import threading
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "platform_support.py"
spec = importlib.util.spec_from_file_location("platform_support", SCRIPT)
platform_support = importlib.util.module_from_spec(spec)
sys.modules["platform_support"] = platform_support
spec.loader.exec_module(platform_support)


# --- T091: venv_python -----------------------------------------------------


@pytest.mark.parametrize(
    ("os_name", "expected"),
    [
        ("linux", "bin/python"),
        ("darwin", "bin/python"),
        ("windows", "Scripts/python.exe"),
    ],
)
def test_venv_python_matches_os_layout(tmp_path, os_name, expected):
    result = platform_support.venv_python(os_name, tmp_path)

    assert result == tmp_path / Path(expected)


def test_venv_python_rejects_unknown_os():
    with pytest.raises(ValueError, match="unknown os_name"):
        platform_support.venv_python("amiga", Path("/venv"))


# --- T091: torch_index -------------------------------------------------------


@pytest.mark.parametrize(
    ("os_name", "has_nvidia", "expected"),
    [
        ("linux", True, "https://download.pytorch.org/whl/cu130"),
        ("windows", True, "https://download.pytorch.org/whl/cu130"),
        ("linux", False, "https://download.pytorch.org/whl/cpu"),
        ("windows", False, "https://download.pytorch.org/whl/cpu"),
        ("darwin", True, None),
        ("darwin", False, None),
    ],
)
def test_torch_index_picks_wheel_for_os_and_gpu(os_name, has_nvidia, expected):
    assert platform_support.torch_index(os_name, has_nvidia) == expected


# --- T091: stop_strategy ------------------------------------------------------


@pytest.mark.parametrize(
    ("os_name", "graceful", "force"),
    [
        ("linux", "SIGTERM", "SIGKILL"),
        ("darwin", "SIGTERM", "SIGKILL"),
        ("windows", "terminate", "taskkill /T /F"),
    ],
)
def test_stop_strategy_describes_data_without_executing(os_name, graceful, force):
    strategy = platform_support.stop_strategy(os_name)

    assert strategy.graceful == graceful
    assert strategy.force == force


# --- T091: launcher_kind -------------------------------------------------------


@pytest.mark.parametrize(
    ("os_name", "expected"),
    [
        ("linux", "desktop"),
        ("darwin", "command"),
        ("windows", "cmd"),
    ],
)
def test_launcher_kind_matches_os_quick_launch_format(os_name, expected):
    assert platform_support.launcher_kind(os_name) == expected


# --- T092: wait_for_url -------------------------------------------------------


class _AliveProcess:
    """Stand-in for subprocess.Popen: never exits."""

    def poll(self):
        return None


class _DeadProcess:
    """Stand-in for subprocess.Popen: already exited with `returncode`."""

    def __init__(self, returncode):
        self.returncode = returncode

    def poll(self):
        return self.returncode


@pytest.fixture
def local_http_server():
    server = http.server.HTTPServer(("127.0.0.1", 0), http.server.SimpleHTTPRequestHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/"
    finally:
        server.shutdown()
        thread.join(timeout=5)


def test_wait_for_url_returns_once_server_responds(local_http_server):
    platform_support.wait_for_url(local_http_server, _AliveProcess(), timeout_s=5)


def test_wait_for_url_raises_immediately_when_process_already_dead():
    dead = _DeadProcess(returncode=3)

    with pytest.raises(platform_support.ProcessExitedError) as excinfo:
        platform_support.wait_for_url(
            "http://127.0.0.1:1/never-up", dead, timeout_s=30, poll_interval_s=0.01
        )

    assert excinfo.value.returncode == 3


def test_wait_for_url_times_out_when_nothing_ever_responds():
    with pytest.raises(TimeoutError):
        platform_support.wait_for_url(
            "http://127.0.0.1:1/never-up",
            _AliveProcess(),
            timeout_s=0.2,
            poll_interval_s=0.05,
        )


# --- T092: start_process ------------------------------------------------------


def test_start_process_runs_argument_list_and_writes_log(tmp_path):
    log_path = tmp_path / "proc.log"

    process = platform_support.start_process(
        [sys.executable, "-c", "print('hello from child')"],
        log_path=log_path,
        cwd=tmp_path,
    )
    process.wait(timeout=10)

    assert process.returncode == 0
    assert "hello from child" in log_path.read_text()


def test_detect_os_name_returns_a_supported_value():
    assert platform_support.detect_os_name() in platform_support.SUPPORTED_OS_NAMES


def test_run_state_path_is_under_engine_run(tmp_path):
    assert platform_support.run_state_path(tmp_path) == tmp_path / "engine" / "run" / "studio.pids"


def test_start_process_exit_code_is_observable_when_child_fails_fast(tmp_path):
    log_path = tmp_path / "proc.log"

    process = platform_support.start_process(
        [sys.executable, "-c", "import sys; sys.exit(3)"],
        log_path=log_path,
    )
    process.wait(timeout=10)

    assert process.returncode == 3
