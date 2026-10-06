"""Tests for engine/install_engine.py: pure planning (T095) and smoke test (T096).

Execution on Windows/macOS is NV (not verifiable on this machine): only the
pure, OS-parametrized logic is exercised for those two; real subprocess/git
execution is tested on the structure (argv lists, env, files), never by
actually running git/uv/ComfyUI.
"""

import importlib.util
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "engine" / "install_engine.py"
spec = importlib.util.spec_from_file_location("install_engine", SCRIPT)
install_engine = importlib.util.module_from_spec(spec)
sys.modules["install_engine"] = install_engine
spec.loader.exec_module(install_engine)

platform_support = sys.modules["platform_support"]

EMPTY_STATE = install_engine.EngineState(
    comfy_cloned=False,
    venv_ready=False,
    deps_installed=False,
    inpaint_node_cloned=False,
    model_paths_written=False,
)
DONE_STATE = install_engine.EngineState(
    comfy_cloned=True,
    venv_ready=True,
    deps_installed=True,
    inpaint_node_cloned=True,
    model_paths_written=True,
)


# --- T095: plan_install is pure and OS-parametrized -------------------------


@pytest.mark.parametrize("os_name", ["linux", "darwin", "windows"])
def test_plan_install_fresh_machine_has_nothing_done(os_name):
    steps = install_engine.plan_install(os_name, True, EMPTY_STATE)

    by_name = {step.name: step for step in steps}
    assert by_name["clone_comfyui"].done is False
    assert by_name["venv"].done is False
    assert by_name["torch_and_requirements"].done is False
    assert by_name["inpaint_nodes"].done is False
    assert by_name["model_paths"].done is False
    # Never skippable: always re-checked / re-run.
    assert by_name["space_check"].done is False
    assert by_name["smoke_test"].done is False


@pytest.mark.parametrize("os_name", ["linux", "darwin", "windows"])
def test_plan_install_already_installed_marks_clone_venv_torch_done(os_name):
    steps = install_engine.plan_install(os_name, True, DONE_STATE)

    by_name = {step.name: step for step in steps}
    assert by_name["clone_comfyui"].done is True
    assert by_name["venv"].done is True
    assert by_name["torch_and_requirements"].done is True
    assert by_name["inpaint_nodes"].done is True
    assert by_name["model_paths"].done is True


def test_plan_install_darwin_torch_description_has_no_cuda_index():
    steps = install_engine.plan_install("darwin", True, EMPTY_STATE)

    desc = next(s for s in steps if s.name == "torch_and_requirements").description
    assert "cu130" not in desc
    assert "MPS" in desc


def test_plan_install_linux_with_nvidia_mentions_cuda_index():
    steps = install_engine.plan_install("linux", True, EMPTY_STATE)

    desc = next(s for s in steps if s.name == "torch_and_requirements").description
    assert "cu130" in desc


def test_plan_install_linux_without_nvidia_uses_cpu_index():
    steps = install_engine.plan_install("linux", False, EMPTY_STATE)

    desc = next(s for s in steps if s.name == "torch_and_requirements").description
    assert "cpu" in desc


def test_plan_install_step_order_matches_shell_script():
    steps = install_engine.plan_install("linux", True, EMPTY_STATE)

    assert [s.name for s in steps] == [
        "space_check",
        "clone_comfyui",
        "venv",
        "torch_and_requirements",
        "inpaint_nodes",
        "model_paths",
        "smoke_test",
    ]


# --- has_nvidia_gpu -----------------------------------------------------------


def test_has_nvidia_gpu_true_when_nvidia_smi_on_path(monkeypatch):
    monkeypatch.setattr(install_engine.shutil, "which", lambda name: "/usr/bin/nvidia-smi")
    assert install_engine.has_nvidia_gpu() is True


def test_has_nvidia_gpu_false_when_absent(monkeypatch):
    monkeypatch.setattr(install_engine.shutil, "which", lambda name: None)
    assert install_engine.has_nvidia_gpu() is False


# --- detect_engine_state reads the real filesystem ---------------------------


def test_detect_engine_state_all_false_on_empty_dir(tmp_path):
    state = install_engine.detect_engine_state(tmp_path / "ComfyUI", "linux")

    assert state == EMPTY_STATE


def test_detect_engine_state_true_once_each_marker_exists(tmp_path):
    engine_dir = tmp_path / "ComfyUI"
    (engine_dir / ".git").mkdir(parents=True)
    venv_dir = engine_dir / ".venv"
    site_packages = venv_dir / "lib" / "python3.12" / "site-packages" / "torch"
    site_packages.mkdir(parents=True)
    (venv_dir / "bin").mkdir(parents=True)
    (venv_dir / "bin" / "python").touch()
    node_dir = engine_dir / "custom_nodes" / "comfyui-inpaint-nodes" / ".git"
    node_dir.mkdir(parents=True)
    (engine_dir / "extra_model_paths.yaml").touch()

    state = install_engine.detect_engine_state(engine_dir, "linux")

    assert state == DONE_STATE


def test_detect_engine_state_windows_site_packages_layout(tmp_path):
    engine_dir = tmp_path / "ComfyUI"
    venv_dir = engine_dir / ".venv"
    (venv_dir / "Scripts").mkdir(parents=True)
    (venv_dir / "Scripts" / "python.exe").touch()
    (venv_dir / "Lib" / "site-packages" / "torch").mkdir(parents=True)

    state = install_engine.detect_engine_state(engine_dir, "windows")

    assert state.venv_ready is True
    assert state.deps_installed is True


@pytest.mark.parametrize(
    "os_name,torch_subpath",
    [
        ("linux", ("lib", "python3.12", "site-packages", "torch")),
        ("darwin", ("lib", "python3.12", "site-packages", "torch")),
        ("windows", ("Lib", "site-packages", "torch")),
    ],
)
def test_detect_engine_state_torch_layout_matches_own_os(tmp_path, os_name, torch_subpath):
    """Each OS family's real venv layout is picked up as deps_installed."""
    venv_dir = tmp_path / "ComfyUI" / ".venv"
    venv_dir.joinpath(*torch_subpath).mkdir(parents=True)

    state = install_engine.detect_engine_state(tmp_path / "ComfyUI", os_name)

    assert state.deps_installed is True


@pytest.mark.parametrize(
    "os_name,other_os_torch_subpath",
    [
        ("linux", ("Lib", "site-packages", "torch")),
        ("darwin", ("Lib", "site-packages", "torch")),
        ("windows", ("lib", "python3.12", "site-packages", "torch")),
    ],
)
def test_detect_engine_state_torch_layout_of_other_os_is_not_detected(
    tmp_path, os_name, other_os_torch_subpath
):
    """A torch install laid out for a different OS family must not be seen as installed:
    the detection branches on os_name, it does not just glob for either layout."""
    venv_dir = tmp_path / "ComfyUI" / ".venv"
    venv_dir.joinpath(*other_os_torch_subpath).mkdir(parents=True)

    state = install_engine.detect_engine_state(tmp_path / "ComfyUI", os_name)

    assert state.deps_installed is False


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
