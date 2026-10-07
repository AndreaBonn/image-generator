from pathlib import Path

from start_support import FakeProcess, platform_support, start

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
