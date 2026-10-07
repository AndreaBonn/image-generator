import pytest
from install_engine_support import DONE_STATE, install_engine, platform_support

# --- assert_free_space --------------------------------------------------------


def test_assert_free_space_raises_when_below_minimum(monkeypatch, tmp_path):
    monkeypatch.setattr(
        install_engine.shutil,
        "disk_usage",
        lambda path: type("U", (), {"free": 5_000_000_000})(),
    )

    with pytest.raises(install_engine.InsufficientDiskSpaceError):
        install_engine.assert_free_space(tmp_path, 10)


def test_assert_free_space_passes_when_above_minimum(monkeypatch, tmp_path):
    monkeypatch.setattr(
        install_engine.shutil,
        "disk_usage",
        lambda path: type("U", (), {"free": 20_000_000_000})(),
    )

    install_engine.assert_free_space(tmp_path, 10)  # must not raise


# --- execute_write_model_paths -----------------------------------------------


def test_execute_write_model_paths_substitutes_and_creates_subdirs(tmp_path):
    engine_dir = tmp_path / "ComfyUI"
    engine_dir.mkdir()
    models_dir = tmp_path / "models"
    template_path = tmp_path / "extra_model_paths.yaml.template"
    template_path.write_text("studio:\n  base_path: ${MODELS_DIR}\n  checkpoints: checkpoints\n")

    install_engine.execute_write_model_paths(engine_dir, models_dir, template_path)

    written = (engine_dir / "extra_model_paths.yaml").read_text()
    assert str(models_dir) in written
    assert "${MODELS_DIR}" not in written
    for name in install_engine.MODEL_SUBDIRS:
        assert (models_dir / name).is_dir()


# --- execute_smoke_test (T096): fake process, never a real ComfyUI ----------


class _FakeProcess:
    def __init__(self):
        self.terminated = False
        self.waited = False

    def terminate(self):
        self.terminated = True

    def wait(self, timeout=None):
        self.waited = True
        return 0


def test_execute_smoke_test_starts_waits_and_stops_with_fake_process(tmp_path):
    fake_process = _FakeProcess()
    calls = {}

    def fake_start_process(argv, *, log_path, cwd=None):
        calls["argv"] = argv
        calls["log_path"] = log_path
        return fake_process

    def fake_wait_for_url(url, process, *, timeout_s):
        calls["url"] = url
        calls["process"] = process
        calls["timeout_s"] = timeout_s

    install_engine.execute_smoke_test(
        tmp_path / "ComfyUI",
        "linux",
        comfy_port=8188,
        timeout_s=5,
        repo_root=tmp_path,
        start_process=fake_start_process,
        wait_for_url=fake_wait_for_url,
    )

    assert calls["url"] == "http://127.0.0.1:8188/system_stats"
    assert calls["process"] is fake_process
    assert fake_process.terminated is True
    assert fake_process.waited is True


def test_execute_smoke_test_still_stops_process_when_wait_for_url_raises(tmp_path):
    fake_process = _FakeProcess()

    def fake_start_process(argv, *, log_path, cwd=None):
        return fake_process

    def fake_wait_for_url(url, process, *, timeout_s):
        raise platform_support.ProcessExitedError(1)

    with pytest.raises(platform_support.ProcessExitedError):
        install_engine.execute_smoke_test(
            tmp_path / "ComfyUI",
            "linux",
            comfy_port=8188,
            timeout_s=5,
            repo_root=tmp_path,
            start_process=fake_start_process,
            wait_for_url=fake_wait_for_url,
        )

    assert fake_process.terminated is True


# --- main(): --dry-run never executes anything --------------------------------


def test_main_dry_run_prints_plan_and_never_calls_run_command(monkeypatch, tmp_path, capsys):
    monkeypatch.setattr(install_engine, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(
        install_engine,
        "detect_engine_state",
        lambda engine_dir, os_name: DONE_STATE,
    )
    monkeypatch.setattr(install_engine, "has_nvidia_gpu", lambda: True)

    def must_not_run(*args, **kwargs):
        raise AssertionError("--dry-run must not execute anything")

    monkeypatch.setattr(install_engine, "run_command", must_not_run)
    monkeypatch.setattr(install_engine, "execute_smoke_test", must_not_run)
    monkeypatch.setattr(install_engine, "assert_free_space", must_not_run)

    code = install_engine.main(["--dry-run"])

    assert code == 0
    output = capsys.readouterr().out
    assert "clone_comfyui" not in output  # printed as description, not raw name
    assert "già fatto" in output


def test_main_dry_run_marks_clone_venv_torch_done_when_already_installed(
    monkeypatch, tmp_path, capsys
):
    monkeypatch.setattr(install_engine, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(
        install_engine,
        "detect_engine_state",
        lambda engine_dir, os_name: DONE_STATE,
    )
    monkeypatch.setattr(install_engine, "has_nvidia_gpu", lambda: True)
    monkeypatch.setattr(
        install_engine, "run_command", lambda *a, **k: (_ for _ in ()).throw(AssertionError)
    )
    monkeypatch.setattr(
        install_engine, "execute_smoke_test", lambda *a, **k: (_ for _ in ()).throw(AssertionError)
    )
    monkeypatch.setattr(
        install_engine, "assert_free_space", lambda *a, **k: (_ for _ in ()).throw(AssertionError)
    )

    code = install_engine.main(["--dry-run"])

    output = capsys.readouterr().out
    done_lines = [line for line in output.splitlines() if "già fatto" in line]
    assert code == 0
    assert len(done_lines) == 5  # clone, venv, torch, inpaint_nodes, model_paths
