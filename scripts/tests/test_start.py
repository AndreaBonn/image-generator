import importlib.util
import json
import sys
from pathlib import Path

import pytest

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


# --- ollama_warning -----------------------------------------------------


def test_ollama_warning_present_when_models_running():
    assert start.ollama_warning(["llama3  running"]) == start.OLLAMA_WARNING


def test_ollama_warning_absent_when_no_models():
    assert start.ollama_warning([]) is None


# --- needs_frontend_build ------------------------------------------------


def test_needs_frontend_build_true_when_dist_missing(tmp_path):
    assert start.needs_frontend_build(tmp_path, force=False) is True


def test_needs_frontend_build_false_when_dist_present_and_not_forced(tmp_path):
    dist = tmp_path / "frontend" / "dist"
    dist.mkdir(parents=True)
    (dist / "index.html").write_text("<html></html>")

    assert start.needs_frontend_build(tmp_path, force=False) is False


def test_needs_frontend_build_true_when_forced(tmp_path):
    dist = tmp_path / "frontend" / "dist"
    dist.mkdir(parents=True)
    (dist / "index.html").write_text("<html></html>")

    assert start.needs_frontend_build(tmp_path, force=True) is True


# --- start_engine ---------------------------------------------------------


def test_start_engine_skips_when_already_responding():
    def fail_if_called(*args, **kwargs):
        raise AssertionError("must not start a new engine when one is already up")

    result = start.start_engine(
        CONFIG, start_process=fail_if_called, is_responding=lambda url: True
    )

    assert result is None


def test_start_engine_finds_the_python_of_the_real_venv_layout(tmp_path):
    # Real layout written by install_engine: engine/ComfyUI/.venv/bin/python.
    venv_python = tmp_path / "engine" / "ComfyUI" / ".venv" / "bin" / "python"
    venv_python.parent.mkdir(parents=True)
    venv_python.write_text("")
    started_argv = []
    config = start.StartConfig(repo_root=tmp_path, os_name="linux", comfy_port=8188, app_port=8000)

    def record(argv, **kwargs):
        started_argv.append(argv)
        return FakeProcess(pid=2)

    start.start_engine(
        config,
        start_process=record,
        wait_for_url=lambda *a, **k: None,
        is_responding=lambda url: False,
    )

    assert Path(started_argv[0][0]) == venv_python


def test_start_engine_starts_when_not_responding(monkeypatch, tmp_path):
    monkeypatch.setattr(
        platform_support, "venv_python", lambda os_name, venv_dir: tmp_path / "python"
    )
    (tmp_path / "python").write_text("")  # .exists() must be true
    fake = FakeProcess(pid=2)
    config = start.StartConfig(repo_root=tmp_path, os_name="linux", comfy_port=8188, app_port=8000)

    result = start.start_engine(
        config,
        start_process=lambda *a, **k: fake,
        wait_for_url=lambda *a, **k: None,
        is_responding=lambda url: False,
    )

    assert result is fake


def test_start_engine_raises_when_process_exits_before_ready(monkeypatch, tmp_path):
    monkeypatch.setattr(
        platform_support, "venv_python", lambda os_name, venv_dir: tmp_path / "python"
    )
    (tmp_path / "python").write_text("")
    dead = FakeProcess(pid=3, dead=True, returncode=1)
    config = start.StartConfig(repo_root=tmp_path, os_name="linux", comfy_port=8188, app_port=8000)

    with pytest.raises(platform_support.ProcessExitedError):
        start.start_engine(
            config,
            start_process=lambda *a, **k: dead,
            wait_for_url=platform_support.wait_for_url,
            is_responding=lambda url: False,
        )


def test_start_engine_registers_process_before_wait_for_url_can_raise(monkeypatch, tmp_path):
    """T0xx HIGH finding: the caller must learn the PID before wait_for_url
    blocks or raises, or a slow engine becomes an orphan holding the GPU."""
    monkeypatch.setattr(
        platform_support, "venv_python", lambda os_name, venv_dir: tmp_path / "python"
    )
    (tmp_path / "python").write_text("")
    fake = FakeProcess(pid=5)
    config = start.StartConfig(repo_root=tmp_path, os_name="linux", comfy_port=8188, app_port=8000)
    registered: list[FakeProcess] = []

    def wait_raises(*args, **kwargs):
        raise TimeoutError("engine too slow")

    with pytest.raises(TimeoutError):
        start.start_engine(
            config,
            start_process=lambda *a, **k: fake,
            wait_for_url=wait_raises,
            is_responding=lambda url: False,
            on_started=registered.append,
        )

    assert registered == [fake]


def test_start_backend_registers_process_before_wait_for_url_can_raise(tmp_path):
    fake = FakeProcess(pid=6)
    config = start.StartConfig(repo_root=tmp_path, os_name="linux", comfy_port=8188, app_port=8000)
    registered: list[FakeProcess] = []

    def wait_raises(*args, **kwargs):
        raise TimeoutError("backend too slow")

    with pytest.raises(TimeoutError):
        start.start_backend(
            config,
            start_process=lambda *a, **k: fake,
            wait_for_url=wait_raises,
            on_started=registered.append,
        )

    assert registered == [fake]


# --- start_process_inherit_output: backend logs on the terminal ---------


def test_start_process_inherit_output_does_not_redirect_streams(monkeypatch, tmp_path):
    captured = {}

    class FakePopen:
        def __init__(self, argv, **kwargs):
            captured["argv"] = argv
            captured["kwargs"] = kwargs

    monkeypatch.setattr(start.subprocess, "Popen", FakePopen)

    start.start_process_inherit_output(["echo", "hi"], cwd=tmp_path)

    assert captured["argv"] == ["echo", "hi"]
    assert "stdout" not in captured["kwargs"]
    assert "stderr" not in captured["kwargs"]
    assert captured["kwargs"]["cwd"] == tmp_path


# --- write_run_state / remove_run_state ----------------------------------


def test_write_run_state_records_both_pids_as_json(tmp_path):
    start.write_run_state(tmp_path, engine_pid=123, backend_pid=456)

    path = platform_support.run_state_path(tmp_path)
    assert json.loads(path.read_text()) == {"engine": 123, "backend": 456}


def test_write_run_state_records_null_engine_when_engine_was_preexisting(tmp_path):
    start.write_run_state(tmp_path, engine_pid=None, backend_pid=456)

    path = platform_support.run_state_path(tmp_path)
    assert json.loads(path.read_text()) == {"engine": None, "backend": 456}


def test_remove_run_state_deletes_the_file_if_present(tmp_path):
    start.write_run_state(tmp_path, engine_pid=1, backend_pid=2)
    path = platform_support.run_state_path(tmp_path)
    assert path.is_file()

    start.remove_run_state(tmp_path)

    assert not path.exists()


def test_remove_run_state_is_a_noop_when_file_is_missing(tmp_path):
    start.remove_run_state(tmp_path)  # must not raise


# --- stop_started_processes: the T093 acceptance criterion --------------


def test_cleanup_terminates_only_started_pids_not_preexisting():
    preexisting = FakeProcess(pid=1)  # never passed to stop_started_processes
    started_engine = FakeProcess(pid=2)
    started_backend = FakeProcess(pid=3)

    start.stop_started_processes([started_engine, started_backend], os_name="linux")

    assert started_engine.terminated is True
    assert started_backend.terminated is True
    assert preexisting.terminated is False


def test_cleanup_skips_processes_already_dead():
    already_dead = FakeProcess(pid=4, dead=True, returncode=0)

    start.stop_started_processes([already_dead], os_name="linux")

    assert already_dead.terminated is False  # poll() != None short-circuits terminate()


# --- main(): error surfaced as exit 1 ------------------------------------


def test_main_returns_1_when_engine_process_dies_immediately(monkeypatch):
    monkeypatch.setattr(start, "default_running_ollama_models", list)
    monkeypatch.setattr(start, "needs_frontend_build", lambda *a, **k: False)
    monkeypatch.setattr(
        start,
        "start_engine",
        lambda *a, **k: (_ for _ in ()).throw(platform_support.ProcessExitedError(1)),
    )
    # start_engine fails before any run-state write, but remove_run_state still
    # runs in the `finally`: stub it so the test never touches the real repo.
    monkeypatch.setattr(start, "remove_run_state", lambda *a, **k: None)

    code = start.main([])

    assert code == 1


def test_main_terminates_orphaned_engine_when_its_startup_times_out(monkeypatch):
    engine_fake = FakeProcess(pid=20)
    recorded_state: list[tuple] = []
    removed: list[Path] = []

    monkeypatch.setattr(start, "default_running_ollama_models", list)
    monkeypatch.setattr(start, "needs_frontend_build", lambda *a, **k: False)

    def fake_start_engine(config, *, on_started=lambda p: None, **kwargs):
        on_started(engine_fake)
        raise TimeoutError("engine too slow")

    monkeypatch.setattr(start, "start_engine", fake_start_engine)
    monkeypatch.setattr(
        start,
        "write_run_state",
        lambda repo_root, *, engine_pid, backend_pid: recorded_state.append(
            (engine_pid, backend_pid)
        ),
    )
    monkeypatch.setattr(start, "remove_run_state", lambda repo_root: removed.append(repo_root))

    code = start.main([])

    assert code == 1
    assert engine_fake.terminated is True
    assert recorded_state[-1] == (20, None)
    assert removed


def test_main_terminates_orphaned_backend_when_its_startup_times_out(monkeypatch):
    engine_fake = FakeProcess(pid=21)
    backend_fake = FakeProcess(pid=22)

    monkeypatch.setattr(start, "default_running_ollama_models", list)
    monkeypatch.setattr(start, "needs_frontend_build", lambda *a, **k: False)

    def fake_start_engine(config, *, on_started=lambda p: None, **kwargs):
        on_started(engine_fake)
        return engine_fake

    def fake_start_backend(config, *, on_started=lambda p: None, **kwargs):
        on_started(backend_fake)
        raise TimeoutError("backend too slow")

    monkeypatch.setattr(start, "start_engine", fake_start_engine)
    monkeypatch.setattr(start, "start_backend", fake_start_backend)
    monkeypatch.setattr(start, "write_run_state", lambda *a, **k: None)
    monkeypatch.setattr(start, "remove_run_state", lambda *a, **k: None)

    code = start.main([])

    assert code == 1
    assert engine_fake.terminated is True
    assert backend_fake.terminated is True


def test_main_stops_both_started_processes_on_keyboard_interrupt(monkeypatch):
    engine_fake = FakeProcess(pid=10)
    backend_fake = FakeProcess(pid=11)

    monkeypatch.setattr(start, "default_running_ollama_models", list)
    monkeypatch.setattr(start, "needs_frontend_build", lambda *a, **k: False)

    def fake_start_engine(config, *, on_started=lambda p: None, **kwargs):
        on_started(engine_fake)
        return engine_fake

    def fake_start_backend(config, *, on_started=lambda p: None, **kwargs):
        on_started(backend_fake)
        return backend_fake

    monkeypatch.setattr(start, "start_engine", fake_start_engine)
    monkeypatch.setattr(start, "start_backend", fake_start_backend)
    # Stub run-state persistence: these tests assert on cleanup, not the file,
    # and must never write into the real repo this test file lives in.
    monkeypatch.setattr(start, "write_run_state", lambda *a, **k: None)
    monkeypatch.setattr(start, "remove_run_state", lambda *a, **k: None)

    wait_calls = {"n": 0}

    def wait_raises_once_then_succeeds(timeout=None):
        wait_calls["n"] += 1
        if wait_calls["n"] == 1:
            raise KeyboardInterrupt()  # the Ctrl+C the user sent while running
        return 0  # the process has since been terminated by cleanup

    backend_fake.wait = wait_raises_once_then_succeeds

    code = start.main([])

    assert code == 0
    assert engine_fake.terminated is True
    assert backend_fake.terminated is True
